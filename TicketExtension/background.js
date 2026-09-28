'use strict';

function parseTimeStr(timeStr) {
  if (!timeStr) return 0;
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!match) return 0;
  let hours = parseInt(match[1], 10);
  const mins = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  return hours * 60 + mins;
}

const phoneCache = new Map();

function formatPhoneForKairos(rawPhone) {
  if (!rawPhone) return null;
  let cleaned = String(rawPhone).replace(/[^\d]/g, '');
  if (!cleaned) return null;

  if (cleaned.startsWith('0020')) {
    cleaned = cleaned.substring(2);
  }

  // Handle +20 010... (extra 0 after 20 -> 2001[0125] -> 201[0125])
  if (cleaned.startsWith('2001') && cleaned.length === 13) {
    cleaned = '20' + cleaned.substring(3);
  }

  // Egyptian mobile: 010, 011, 012, 015 (11 digits) -> prefix with 2 -> 201x xxxxxxxx (12 digits)
  if (cleaned.startsWith('01') && cleaned.length === 11) {
    cleaned = '2' + cleaned;
  } else if (/^1[0125]\d{8}$/.test(cleaned)) {
    cleaned = '20' + cleaned;
  }

  // Egyptian mobile: exactly 12 digits starting with 2010, 2011, 2012, 2015
  if (/^201[0125]\d{8}$/.test(cleaned)) {
    return cleaned;
  }

  // Egyptian landlines (10 digits starting with 02 or 03 -> 202..., 203...)
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '2' + cleaned;
  }
  if (/^20[2-9]\d{7,8}$/.test(cleaned)) {
    return cleaned;
  }

  // International phone: 10 to 15 digits
  if (cleaned.length >= 10 && cleaned.length <= 15) {
    // Strictly reject order numbers (13 digits starting with 2[1-9] like 2809100214792)
    if (cleaned.length === 13 && /^2[1-9]/.test(cleaned)) {
      return null;
    }
    return cleaned;
  }

  return null;
}

function extractPhoneFromHtml(html) {
  if (!html) return null;

  // 1. Direct check for tel: links
  const telMatch = html.match(/href=["']tel:([+\d\s\-()]{8,25})["']/i);
  if (telMatch && telMatch[1]) {
    const phone = formatPhoneForKairos(telMatch[1]);
    if (phone) return phone;
  }

  // 2. Billing phone input (WooCommerce billing phone input with attributes in any order)
  const inputMatch = html.match(/<input[^>]+(?:name|id)=["']_billing_phone["'][^>]*value=["']([^"']+)["']/i) ||
                     html.match(/<input[^>]+value=["']([^"']+)["'][^>]*?(?:name|id)=["']_billing_phone["']/i);
  if (inputMatch && inputMatch[1]) {
    const phone = formatPhoneForKairos(inputMatch[1]);
    if (phone) return phone;
  }

  // 3. Search inside editAddress or order_data_column or billing container
  const editAddrMatch = html.match(/id=["']editAddress["'][\s\S]{0,3500}/i) || 
                        html.match(/class=["'][^"']*order_data_column[^"']*["'][\s\S]{0,3500}/i) ||
                        html.match(/class=["'][^"']*billing[^"']*["'][\s\S]{0,3500}/i);
  if (editAddrMatch) {
    const block = editAddrMatch[0];

    // Check tel link inside block
    const bTel = block.match(/href=["']tel:([+\d\s\-()]{8,25})["']/i);
    if (bTel && bTel[1]) {
      const p = formatPhoneForKairos(bTel[1]);
      if (p) return p;
    }

    // Check Phone: label followed by phone number
    const mP = block.match(/(?:Phone|Mobile|الهاتف|موبايل):?(?:<[^>]+>|["'\s\n\r]|&nbsp;)*([+\d\s\-()]{8,25})/i);
    if (mP) {
      const phone = formatPhoneForKairos(mP[1] || mP[0]);
      if (phone) return phone;
    }

    // Check Egyptian phone inside billing block
    const mEg = block.match(/(?:(?:\+?20|0020)[\s\-()]*)?0?1[0125][\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d/);
    if (mEg) {
      const phone = formatPhoneForKairos(mEg[0]);
      if (phone) return phone;
    }
  }

  // 4. JSON data
  const jsonMatch = html.match(/"(?:billing_phone|phone|customer_phone|mobile)":\s*["']([^"']+)["']/i);
  if (jsonMatch && jsonMatch[1]) {
    const phone = formatPhoneForKairos(jsonMatch[1]);
    if (phone) return phone;
  }

  return null;
}

function openOrderTabAndExtractPhone(orderUrl, sendResponse) {
  let isDone = false;
  let pollIv = null;
  let timeoutId = null;

  const safeSend = (data) => {
    if (isDone) return;
    isDone = true;
    if (pollIv) clearInterval(pollIv);
    if (timeoutId) clearTimeout(timeoutId);

    try {
      sendResponse(data);
    } catch (e) {
      console.warn('[BF Extension] sendResponse failed:', e);
    }
  };

  chrome.tabs.create({ url: orderUrl, active: false }, (newTab) => {
    if (chrome.runtime.lastError || !newTab) {
      safeSend({
        success: false,
        error: 'Failed to open background tab: ' + (chrome.runtime.lastError?.message || '')
      });
      return;
    }

    const tabId = newTab.id;

    const finishAndCloseTab = (data) => {
      try {
        chrome.tabs.remove(tabId, () => {
          if (chrome.runtime.lastError) { /* ignore */ }
        });
      } catch (e) {}

      if (!data || !data.success) {
        safeSend({
          success: false,
          error: data?.error || 'Failed to extract customer phone number from order page.'
        });
        return;
      }

      const phone = formatPhoneForKairos(data.phone);
      if (!phone || phone.length < 8) {
        safeSend({
          success: false,
          error: 'Phone number found is invalid: ' + data.phone
        });
        return;
      }

      phoneCache.set(orderUrl, phone);
      const kairosUrl = `https://kairos.breadfast.com/app/accounts/1/search?q=${encodeURIComponent(phone)}`;
      chrome.tabs.create({ url: kairosUrl, active: true });

      safeSend({
        success: true,
        phone: phone
      });
    };

    // Overall safety timeout of 3.8 seconds for the background tab
    timeoutId = setTimeout(() => {
      finishAndCloseTab({ success: false, error: 'Timed out waiting for order page.' });
    }, 3800);

    const extractScript = () => {
      if (document.querySelector('form#loginform') || window.location.pathname.includes('wp-login.php')) {
        return { error: 'Not logged into Breadfast Admin. Please log into Breadfast first.' };
      }

      const cleanPhone = (raw) => {
        if (!raw) return null;
        let c = String(raw).replace(/[^\d]/g, '');
        if (c.startsWith('0020')) c = c.substring(2);
        if (c.startsWith('2001') && c.length === 13) c = '20' + c.substring(3);
        if (c.startsWith('01') && c.length === 11) c = '2' + c;
        else if (/^1[0125]\d{8}$/.test(c)) c = '20' + c;
        if (/^201[0125]\d{8}$/.test(c)) return c;
        if (c.length >= 10 && c.length <= 15) {
          if (c.length === 13 && /^2[1-9]/.test(c)) return null;
          return c;
        }
        return null;
      };

      // 1. Check all tel: links
      const telLinks = Array.from(document.querySelectorAll('a[href^="tel:"]'));
      for (const a of telLinks) {
        const p = cleanPhone(a.getAttribute('href') || a.textContent);
        if (p) return { success: true, phone: p };
      }

      // 2. Check billing phone inputs / meta fields
      const inputs = Array.from(document.querySelectorAll('input[name*="billing_phone" i], input#_billing_phone, input[name*="phone" i]'));
      for (const inp of inputs) {
        if (inp.value) {
          const p = cleanPhone(inp.value);
          if (p) return { success: true, phone: p };
        }
      }

      // 3. Search inside billing containers and order columns
      const containers = Array.from(document.querySelectorAll(
        '#editAddress, .order_data_column, .billing-address, [class*="billing" i], [class*="customer" i], .ant-descriptions, table.order_details'
      ));

      for (const container of containers) {
        const text = container.textContent || '';
        const m = text.match(/(?:phone|mobile|هاتف|موبايل):?\s*([+\d\s\-()]{8,25})/i) ||
                  text.match(/(?:(?:\+?20|0020)[\s\-()]*)?0?1[0125][\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d/);
        if (m) {
          const p = cleanPhone(m[1] || m[0]);
          if (p) return { success: true, phone: p };
        }
      }

      // 4. Fallback search across body for Egyptian mobile numbers
      const bodyText = document.body ? (document.body.innerText || '') : '';
      const bodyM = bodyText.match(/(?:phone|mobile):?\s*([+\d\s\-()]{8,25})/i);
      if (bodyM) {
        const p = cleanPhone(bodyM[1]);
        if (p) return { success: true, phone: p };
      }

      return null;
    };

    let attempts = 0;
    pollIv = setInterval(() => {
      if (isDone) {
        clearInterval(pollIv);
        return;
      }
      attempts++;

      chrome.scripting.executeScript({
        target: { tabId },
        func: extractScript
      }, (results) => {
        if (chrome.runtime.lastError || isDone) {
          return;
        }
        if (results && results[0] && results[0].result) {
          const res = results[0].result;
          if (res.success && res.phone) {
            finishAndCloseTab(res);
          } else if (res.error && res.error.includes('Not logged in')) {
            finishAndCloseTab(res);
          }
        }
      });

      if (attempts >= 25) { // 25 * 120ms = 3.0s
        clearInterval(pollIv);
        finishAndCloseTab({ success: false, error: 'Could not find customer Phone number on order page.' });
      }
    }, 120);
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'open_kairos_search') {
    if (request.url) {
      chrome.tabs.create({ url: request.url, active: true });
    }
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'open_chat_search') {
    const orderUrl = request.url;
    if (!orderUrl) {
      sendResponse({ success: false, error: 'No Order URL provided.' });
      return false;
    }

    // 1. Instant cache check (0ms)
    if (phoneCache.has(orderUrl)) {
      const cachedPhone = phoneCache.get(orderUrl);
      const validCached = formatPhoneForKairos(cachedPhone);
      if (validCached) {
        const kairosUrl = `https://kairos.breadfast.com/app/accounts/1/search?q=${encodeURIComponent(validCached)}`;
        chrome.tabs.create({ url: kairosUrl, active: true });
        sendResponse({ success: true, phone: validCached });
        return true;
      } else {
        phoneCache.delete(orderUrl);
      }
    }

    (async () => {
      // 2. Fast streaming fetch (reads first 30-100KB, finishes in ~150ms instead of downloading whole page!)
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const resp = await fetch(orderUrl, {
          credentials: 'include',
          signal: controller.signal
        });

        if (resp.ok) {
          let foundPhone = null;
          if (resp.body) {
            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let partialHtml = '';

            while (true) {
              const { done, value } = await reader.read();
              if (value) {
                partialHtml += decoder.decode(value, { stream: !done });
                foundPhone = extractPhoneFromHtml(partialHtml);
                if (foundPhone) {
                  try { await reader.cancel(); } catch (e) {}
                  break;
                }
              }
              if (done || partialHtml.length > 500000) {
                try { await reader.cancel(); } catch (e) {}
                break;
              }
            }
          } else {
            const html = await resp.text();
            foundPhone = extractPhoneFromHtml(html);
          }

          clearTimeout(timeoutId);

          if (foundPhone) {
            phoneCache.set(orderUrl, foundPhone);
            const kairosUrl = `https://kairos.breadfast.com/app/accounts/1/search?q=${encodeURIComponent(foundPhone)}`;
            chrome.tabs.create({ url: kairosUrl, active: true });
            sendResponse({ success: true, phone: foundPhone });
            return;
          }
        }
      } catch (err) {
        // Fast streaming fetch failed or timed out, proceed to background tab fallback immediately
      }

      // 3. Fast background tab fallback
      try {
        openOrderTabAndExtractPhone(orderUrl, sendResponse);
      } catch (e) {
        sendResponse({ success: false, error: e.message || 'Background tab failed.' });
      }
    })();

    return true; // Keep sendResponse open asynchronously
  }

  if (request.action === 'calculate_delay') {
    const orderUrl = request.url;
    if (!orderUrl) {
      sendResponse({ success: false, error: 'No Order URL provided.' });
      return false;
    }

    // Open the order page in an inactive/background tab so the user stays on Freshdesk
    chrome.tabs.create({ url: orderUrl, active: false }, (newTab) => {
      if (chrome.runtime.lastError || !newTab) {
        sendResponse({
          success: false,
          error: 'Failed to open background tab: ' + (chrome.runtime.lastError?.message || '')
        });
        return;
      }

      const tabId = newTab.id;
      let isDone = false;

      const finishAndCloseTab = (data) => {
        if (isDone) return;
        isDone = true;

        chrome.tabs.onUpdated.removeListener(onTabUpdated);
        clearTimeout(timeoutId);

        // Always close the tab so the user never sees it left open
        try {
          chrome.tabs.remove(tabId, () => {
            if (chrome.runtime.lastError) { /* ignore */ }
          });
        } catch (e) {}

        if (!data || !data.success) {
          sendResponse({
            success: false,
            error: data?.error || 'Failed to extract delay from order page.'
          });
          return;
        }

        const promisedMins = parseTimeStr(data.promisedTime);
        const completedMins = parseTimeStr(data.completedTime);

        let diff = completedMins - promisedMins;
        if (diff < -720) diff += 1440;
        if (diff > 720) diff -= 1440;

        sendResponse({
          success: true,
          diff,
          promisedTime: data.promisedTime,
          completedTime: data.completedTime
        });
      };

      // 12-second safety timeout to close the tab if anything hangs
      const timeoutId = setTimeout(() => {
        finishAndCloseTab({ success: false, error: 'Timed out waiting for order page.' });
      }, 12000);

      const onTabUpdated = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          // Once page load is complete, inject extractor function
          chrome.scripting.executeScript({
            target: { tabId },
            func: async () => {
              const checkData = () => {
                const bodyText = document.body ? (document.body.innerText || '') : '';
                
                // Check if redirected to login page
                if (document.querySelector('form#loginform') || window.location.pathname.includes('wp-login.php')) {
                  return { error: 'Not logged into Breadfast Admin. Please log into Breadfast first.' };
                }

                // Match Promised time
                const promisedMatch = bodyText.match(/Arriving by\s*(\d{1,2}:\d{2}\s*[AP]M)/i) || 
                                      bodyText.match(/Promised time:[^\d]*(\d{1,2}:\d{2}\s*[AP]M)/i) ||
                                      bodyText.match(/Promised[^\d]*(\d{1,2}:\d{2}\s*[AP]M)/i);

                // Match Operations table
                const table = document.querySelector('table.operations-table') || document.querySelector('table[class*="operations"]');

                if (promisedMatch && table) {
                  const ths = Array.from(table.querySelectorAll('th'));
                  let completedColIdx = -1;
                  ths.forEach((th, idx) => {
                    if (th.textContent.trim().toLowerCase().includes('completed')) {
                      completedColIdx = idx;
                    }
                  });
                  if (completedColIdx === -1) completedColIdx = 4; // fallback to 5th col

                  const firstRow = table.querySelector('tbody tr') || table.querySelectorAll('tr')[1];
                  if (firstRow) {
                    const cells = firstRow.querySelectorAll('td');
                    if (cells.length > completedColIdx && cells[completedColIdx].textContent.trim()) {
                      const completedMatch = cells[completedColIdx].textContent.trim().match(/(\d{1,2}:\d{2}\s*[AP]M)/i);
                      if (completedMatch) {
                        return {
                          success: true,
                          promisedTime: promisedMatch[1].trim(),
                          completedTime: completedMatch[1].trim()
                        };
                      }
                    }
                  }
                }
                return null;
              };

              // Poll for up to 5 seconds (10 attempts x 500ms) for DOM rendering
              for (let i = 0; i < 10; i++) {
                const res = checkData();
                if (res) return res;
                await new Promise(resolve => setTimeout(resolve, 500));
              }

              // Final diagnosis if not found
              const bodyText = document.body ? (document.body.innerText || '') : '';
              if (document.querySelector('form#loginform') || window.location.pathname.includes('wp-login.php')) {
                return { error: 'Not logged into Breadfast Admin. Please log in first.' };
              }
              const promisedMatch = bodyText.match(/Arriving by\s*(\d{1,2}:\d{2}\s*[AP]M)/i) || bodyText.match(/Promised time:[^\d]*(\d{1,2}:\d{2}\s*[AP]M)/i);
              if (!promisedMatch) return { error: 'Could not find Promised Time on order page.' };
              return { error: 'Order is not yet Completed in operations table.' };
            }
          }, (results) => {
            if (chrome.runtime.lastError) {
              finishAndCloseTab({ success: false, error: chrome.runtime.lastError.message });
              return;
            }
            if (results && results[0] && results[0].result) {
              finishAndCloseTab(results[0].result);
            } else {
              finishAndCloseTab({ success: false, error: 'Could not read order data.' });
            }
          });
        }
      };

      chrome.tabs.onUpdated.addListener(onTabUpdated);
    });

    return true; // Keep sendResponse open asynchronously
  }
});
