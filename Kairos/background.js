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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
