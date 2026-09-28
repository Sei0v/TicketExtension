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
  if (cleaned.startsWith('0020')) {
    cleaned = cleaned.substring(2);
  }
  // Egyptian local numbers 010, 011, 012, 015 (11 digits) -> convert 01 to 201
  if (cleaned.startsWith('01') && cleaned.length === 11) {
    cleaned = '2' + cleaned;
  }
  return cleaned;
}

function extractPhoneFromHtml(html) {
  if (!html) return null;

  // 1. Label followed by number (supports <b>, <strong>, <p>, multiline, quotes, spaces, tel links)
  const p1 = /Phone:?(?:<[^>]+>|["'\s\n\r]|&nbsp;)*([+\d\s\-()]{8,20})/i;
  const m1 = html.match(p1);
  if (m1 && m1[1]) {
    const phone = formatPhoneForKairos(m1[1]);
    if (phone && phone.length >= 8) return phone;
  }

  // 2. tel: links
  const telMatch = html.match(/href=["']tel:([+\d\s\-()]+)["']/i);
  if (telMatch && telMatch[1]) {
    const phone = formatPhoneForKairos(telMatch[1]);
    if (phone && phone.length >= 8) return phone;
  }

  // 3. Billing phone inputs or JSON fields
  const p3 = /(?:name|id)=["']_billing_phone["']\s+value=["']([^"']+)["']/i;
  const p3b = /value=["']([^"']+)["']\s+(?:name|id)=["']_billing_phone["']/i;
  const p3c = /"(?:billing_phone|phone)":\s*["']([^"']+)["']/i;
  const m3 = html.match(p3) || html.match(p3b) || html.match(p3c);
  if (m3 && m3[1]) {
    const phone = formatPhoneForKairos(m3[1]);
    if (phone && phone.length >= 8) return phone;
  }

  // 4. Fallback search inside editAddress block
  const editAddrMatch = html.match(/id=["']editAddress["'][\s\S]*?(?:<\/div>\s*<\/div>|<\/table>|<\/form>)/i) || 
                        html.match(/class=["']order_data_column["'][\s\S]*?(?:<\/div>\s*<\/div>|<\/table>|<\/form>)/i);
  if (editAddrMatch) {
    const m4 = editAddrMatch[0].match(/Phone:?(?:<[^>]+>|["'\s\n\r]|&nbsp;)*([+\d\s\-()]{8,20})/i) ||
               editAddrMatch[0].match(/([+]?20[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d|01[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d)/);
    if (m4 && m4[1]) {
      const phone = formatPhoneForKairos(m4[1]);
      if (phone && phone.length >= 8) return phone;
    }
  }

  return null;
}

function openOrderTabAndExtractPhone(orderUrl, sendResponse) {
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

      clearInterval(pollIv);
      clearTimeout(timeoutId);

      try {
        chrome.tabs.remove(tabId, () => {
          if (chrome.runtime.lastError) { /* ignore */ }
        });
      } catch (e) {}

      if (!data || !data.success) {
        sendResponse({
          success: false,
          error: data?.error || 'Failed to extract customer phone number from order page.'
        });
        return;
      }

      const phone = formatPhoneForKairos(data.phone);
      if (!phone || phone.length < 8) {
        sendResponse({
          success: false,
          error: 'Phone number found is invalid: ' + data.phone
        });
        return;
      }

      phoneCache.set(orderUrl, phone);
      const kairosUrl = `https://kairos.breadfast.com/app/accounts/1/search?q=${encodeURIComponent(phone)}`;
      chrome.tabs.create({ url: kairosUrl, active: true });

      sendResponse({
        success: true,
        phone: phone
      });
    };

    const timeoutId = setTimeout(() => {
      finishAndCloseTab({ success: false, error: 'Timed out waiting for order page.' });
    }, 7000);

    const extractScript = () => {
      if (document.querySelector('form#loginform') || window.location.pathname.includes('wp-login.php')) {
        return { error: 'Not logged into Breadfast Admin. Please log into Breadfast first.' };
      }

      const containers = [
        document.querySelector('#editAddress'),
        document.querySelector('.order_data_column'),
        document.body
      ].filter(Boolean);

      for (const container of containers) {
        const tags = Array.from(container.querySelectorAll('b, strong, span, p, label'));
        for (const el of tags) {
          const text = (el.textContent || '').trim();
          if (/^phone:?/i.test(text)) {
            const parentText = el.parentElement ? el.parentElement.textContent : '';
            const match = parentText.match(/phone:?\s*([+\d\s\-()]{8,})/i);
            if (match) return { success: true, phone: match[1].trim() };

            let next = el.nextSibling;
            while (next) {
              const sibText = (next.textContent || '').trim();
              const sibMatch = sibText.match(/([+\d\s\-()]{8,})/);
              if (sibMatch) return { success: true, phone: sibMatch[1].trim() };
              next = next.nextSibling;
            }
          }
        }

        const telLinks = Array.from(container.querySelectorAll('a[href^="tel:"]'));
        if (telLinks.length > 0) {
          const href = telLinks[0].getAttribute('href') || '';
          const raw = href.replace('tel:', '').trim();
          if (raw) return { success: true, phone: raw };
        }

        const phoneInput = container.querySelector('input[name*="phone" i], input[id*="phone" i]');
        if (phoneInput && phoneInput.value && phoneInput.value.trim().length >= 8) {
          return { success: true, phone: phoneInput.value.trim() };
        }
      }

      const bodyText = document.body ? (document.body.innerText || '') : '';
      const match = bodyText.match(/phone:?\s*([+\d\s\-()]{8,})/i);
      if (match) {
        return { success: true, phone: match[1].trim() };
      }

      return null;
    };

    // Fast active polling every 100ms - does NOT wait for 'complete' status!
    let attempts = 0;
    const pollIv = setInterval(() => {
      if (isDone) {
        clearInterval(pollIv);
        return;
      }
      attempts++;

      chrome.scripting.executeScript({
        target: { tabId },
        func: extractScript
      }, (results) => {
        if (chrome.runtime.lastError) {
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

      if (attempts > 35) {
        clearInterval(pollIv);
        finishAndCloseTab({ success: false, error: 'Could not find customer Phone number on order page.' });
      }
    }, 100);
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'open_chat_search') {
    const orderUrl = request.url;
    if (!orderUrl) {
      sendResponse({ success: false, error: 'No Order URL provided.' });
      return false;
    }

    // 1. Instant cache check (0ms)
    if (phoneCache.has(orderUrl)) {
      const cachedPhone = phoneCache.get(orderUrl);
      const kairosUrl = `https://kairos.breadfast.com/app/accounts/1/search?q=${encodeURIComponent(cachedPhone)}`;
      chrome.tabs.create({ url: kairosUrl, active: true });
      sendResponse({ success: true, phone: cachedPhone });
      return true;
    }

    (async () => {
      // 2. Ultra-fast streaming fetch (reads first 30-100KB, finishes in ~150ms instead of downloading 2MB!)
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

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
      openOrderTabAndExtractPhone(orderUrl, sendResponse);
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
