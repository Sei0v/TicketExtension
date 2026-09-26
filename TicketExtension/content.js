(function() {
  'use strict';

  // Only run on Freshdesk (freshdesk.breadfast.com or *.freshdesk.com)
  if (!window.location.host.includes('freshdesk')) {
    return;
  }

  function showToast(message, type = 'info') {
    if (!document.body) return;
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed !important;
      bottom: 24px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      background-color: ${type === 'error' ? '#e63946' : '#1f2937'} !important;
      color: #ffffff !important;
      padding: 12px 24px !important;
      border-radius: 8px !important;
      z-index: 2147483647 !important;
      font-size: 14px !important;
      font-weight: bold !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.35) !important;
      pointer-events: none !important;
      transition: opacity 0.5s !important;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 500);
    }, 6000);
  }

  function ensureButtons() {
    if (!document.body) return;
    if (document.getElementById('bf-custom-ticket-buttons')) return;

    const container = document.createElement('div');
    container.id = 'bf-custom-ticket-buttons';
    
    // Position fixed at the bottom right corner of the page
    container.style.position = 'fixed';
    container.style.bottom = '20px';
    container.style.right = '20px';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '6px';
    container.style.zIndex = '999999';

    const createBtn = (id, text, color) => {
      const btn = document.createElement('button');
      btn.id = id;
      btn.textContent = text;
      btn.style.padding = '6px 12px';
      btn.style.border = 'none';
      btn.style.borderRadius = '6px';
      btn.style.backgroundColor = color;
      btn.style.color = '#fff';
      btn.style.fontSize = '12px';
      btn.style.fontWeight = 'bold';
      btn.style.cursor = 'pointer';
      btn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.15)';
      btn.style.transition = 'transform 0.1s, filter 0.2s';
      btn.style.lineHeight = '1.3';
      btn.style.whiteSpace = 'nowrap';

      btn.addEventListener('mouseenter', () => btn.style.filter = 'brightness(0.92)');
      btn.addEventListener('mouseleave', () => btn.style.filter = 'brightness(1)');
      btn.addEventListener('mousedown', () => btn.style.transform = 'scale(0.96)');
      btn.addEventListener('mouseup', () => btn.style.transform = 'scale(1)');

      return btn;
    };

    const seniorBtn = createBtn('btn-senior-ticket', 'Senior Ticket', '#e63946');
    const createBtnEl = createBtn('btn-create-ticket', 'Create Ticket', '#2a9d8f');
    const rmsBtn = createBtn('btn-rms-order', 'RMS', '#6366f1');
    const delayBtn = createBtn('btn-delay-calc', 'Calculate Delay', '#f59e0b');

    // Helper to extract UID and validate it between "User Profile" and "Profile" buttons
    function extractUidWithValidation() {
      let uid1 = null;
      let uid2 = null;

      const allElements = Array.from(document.querySelectorAll('a, button, span, div'));
      
      for (const el of allElements) {
        const text = (el.textContent || '').trim().toLowerCase();
        
        if (!uid1 && (text === 'user profile' || (el.tagName === 'A' && el.href && el.href.includes('switcher/?uid=')))) {
          const match = el.outerHTML.match(/uid=(\d+)/);
          if (match) uid1 = match[1];
        }

        if (!uid2 && text === 'profile') {
          const match = el.outerHTML.match(/uid=(\d+)/) || el.outerHTML.match(/(?:contacts|customers)\/(\d+)/);
          if (match) {
            uid2 = match[1];
          } else {
            const fallbackMatch = el.outerHTML.match(/(\d{5,})/);
            if (fallbackMatch) uid2 = fallbackMatch[1];
          }
        }
      }

      if (uid1 && uid2) {
        if (uid1 === uid2) return uid1;
        else return null; 
      }
      return uid1 || uid2 || null;
    }

    function extractCustomerInfo() {
      let name = '';
      let email = '';
      
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      let node;
      while ((node = walker.nextNode())) {
        const text = node.nodeValue.trim();
        const nameMatch = text.match(/Customer Name:\s*(.+)/i);
        if (nameMatch) {
          name = nameMatch[1].trim();
          break;
        }
      }

      if (!name) {
        const nameEl = document.querySelector('.user-name, .requester-name');
        if (nameEl) name = nameEl.textContent.trim();
      }

      const emailEls = Array.from(document.querySelectorAll('a[href^="mailto:"]'));
      if (emailEls.length > 0) {
        email = emailEls[0].textContent.trim();
      } else {
        const bodyText = document.body.innerText || '';
        const emailMatch = bodyText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
        if (emailMatch) email = emailMatch[0];
      }

      return { name, email };
    }

    function extractContactId() {
      const links = Array.from(document.querySelectorAll('a[href^="/a/contacts/"]'));
      for (const a of links) {
        const match = a.getAttribute('href').match(/\/a\/contacts\/(\d+)/);
        if (match) return match[1];
      }
      return null;
    }

    function extractOrderNumber() {
      // 1. Try to get it from Order Number input field
      const inputs = Array.from(document.querySelectorAll('input[data-test-text-field*="order_number" i], input[name*="order_number" i], input[id*="order_number" i]'));
      for (const input of inputs) {
        if (input && input.value) {
          const val = input.value.trim();
          const match = val.match(/(\d{4}-\d{6,})/);
          if (match) return match[1];
          if (val) return val;
        }
      }

      // 2. Check elements with data-test-id or title containing order number
      const testIdEls = Array.from(document.querySelectorAll('[data-test-id*="order_number" i], [title*="order" i]'));
      for (const el of testIdEls) {
        const text = (el.textContent || '').trim();
        const match = text.match(/(\d{4}-\d{6,})/);
        if (match) return match[1];
      }

      // 3. Fallback: extract from body text
      const bodyText = document.body ? (document.body.innerText || '') : '';
      const match = bodyText.match(/(\d{4}-\d{6,})/);
      if (match) return match[1];
      
      return null;
    }

    function extractDeliveryBy() {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      let node;
      let nextIsValue = false;
      while ((node = walker.nextNode())) {
        const text = node.nodeValue.trim();
        if (text.toLowerCase() === 'delivery by' || text.toLowerCase() === 'delivery by:') {
          nextIsValue = true;
          continue;
        }
        if (nextIsValue && text) {
           if (text.toLowerCase() === 'restaurant') return 'Restaurant';
           if (text.toLowerCase() === 'breadfast') return 'Breadfast';
           nextIsValue = false;
        }
      }
      
      const bodyText = document.body.innerText || '';
      if (bodyText.match(/delivery by:?\s*restaurant/i)) return 'Restaurant';
      if (bodyText.match(/delivery by:?\s*breadfast/i)) return 'Breadfast';
      return null;
    }

    const openTicketPage = (btnEl, origText) => {
      btnEl.textContent = 'Creating...';
      
      const contactId = extractContactId();
      const orderNumber = extractOrderNumber();
      const deliveryBy = extractDeliveryBy();
      
      const isSenior = origText === 'Senior Ticket';

      if (contactId) {
        let NEW_TICKET_URL = `https://freshdesk.breadfast.com/a/tickets/new?contactId=${contactId}`;
        if (orderNumber) NEW_TICKET_URL += `&bf_order_number=${encodeURIComponent(orderNumber)}`;
        if (deliveryBy) NEW_TICKET_URL += `&bf_delivery_by=${encodeURIComponent(deliveryBy)}`;
        if (isSenior) NEW_TICKET_URL += `&bf_is_senior=1`;
        
        window.open(NEW_TICKET_URL, '_blank', 'noopener,noreferrer');
      } else {
        const uid = extractUidWithValidation();
        const info = extractCustomerInfo();
        
        if (!uid) {
          console.log(origText + ': UID mismatch or not found. Skipping to next step...');
          showToast('Could not find matching Contact ID or UID. Skipping...', 'error');
        } else {
          let NEW_TICKET_URL = `https://freshdesk.breadfast.com/a/tickets/new?bf_uid=${encodeURIComponent(uid)}`;
          if (info.name) NEW_TICKET_URL += `&bf_name=${encodeURIComponent(info.name)}`;
          if (info.email) NEW_TICKET_URL += `&bf_email=${encodeURIComponent(info.email)}`;
          if (orderNumber) NEW_TICKET_URL += `&bf_order_number=${encodeURIComponent(orderNumber)}`;
          if (deliveryBy) NEW_TICKET_URL += `&bf_delivery_by=${encodeURIComponent(deliveryBy)}`;
          if (isSenior) NEW_TICKET_URL += `&bf_is_senior=1`;
          
          window.open(NEW_TICKET_URL, '_blank', 'noopener,noreferrer');
        }
      }

      setTimeout(() => btnEl.textContent = origText, 2000);
    };

    seniorBtn.addEventListener('click', () => openTicketPage(seniorBtn, 'Senior Ticket'));
    createBtnEl.addEventListener('click', () => openTicketPage(createBtnEl, 'Create Ticket'));

    function handleCalculateDelay(btnEl) {
      const origText = btnEl.textContent;
      
      let orderLink = null;
      const allLinks = Array.from(document.querySelectorAll('a'));
      
      for (const a of allLinks) {
        const text = (a.textContent || '').trim().toLowerCase();
        const href = a.getAttribute('href') || a.href || '';
        if (text === 'order' && (href.includes('post.php') || href.includes('breadfast.com'))) {
          orderLink = href.startsWith('http') ? href : (a.href || href);
          break;
        }
      }

      if (!orderLink) {
        for (const a of allLinks) {
          const href = a.getAttribute('href') || a.href || '';
          if (href.includes('/wp-admin/post.php') || href.includes('breadfast.com/wp-admin')) {
            orderLink = href.startsWith('http') ? href : (a.href || href);
            break;
          }
        }
      }

      if (!orderLink) {
        for (const a of allLinks) {
          const text = (a.textContent || '').trim().toLowerCase();
          if (text === 'order' && a.href && a.href.startsWith('http')) {
            orderLink = a.href;
            break;
          }
        }
      }

      if (!orderLink) {
        showToast('Could not find Order link on this ticket.', 'error');
        return;
      }

      btnEl.textContent = 'Calculating...';
      btnEl.style.pointerEvents = 'none';

      chrome.runtime.sendMessage({ action: 'calculate_delay', url: orderLink }, (response) => {
        btnEl.textContent = origText;
        btnEl.style.pointerEvents = 'auto';

        if (chrome.runtime.lastError) {
          console.error('[BF Extension]', chrome.runtime.lastError);
          showToast('Extension error: ' + chrome.runtime.lastError.message, 'error');
          return;
        }

        if (!response) {
          showToast('No response received from background service worker.', 'error');
          return;
        }

        if (!response.success) {
          showToast(response.error || 'Failed to calculate delay.', 'error');
          return;
        }

        const { diff, promisedTime, completedTime } = response;
        if (diff > 0) {
          showToast(`Delay: ${diff} minutes (Promised: ${promisedTime}, Completed: ${completedTime})`, 'error');
        } else if (diff < 0) {
          showToast(`Early by: ${Math.abs(diff)} minutes (Promised: ${promisedTime}, Completed: ${completedTime})`, 'info');
        } else {
          showToast(`On time! (Promised: ${promisedTime}, Completed: ${completedTime})`, 'info');
        }
      });
    }

    delayBtn.addEventListener('click', () => handleCalculateDelay(delayBtn));

    rmsBtn.addEventListener('click', () => {
      const orderNumber = extractOrderNumber();
      if (!orderNumber) {
        showToast('Could not find Order Number on this ticket.', 'error');
        return;
      }
      const rmsUrl = `https://food-rms.breadfast.com/orders/list?page=1&limit=10&sortBy=placedAt&sortOrder=desc&search=${encodeURIComponent(orderNumber)}&searchBy=orderNumber`;
      window.open(rmsUrl, '_blank', 'noopener,noreferrer');
    });

    container.appendChild(seniorBtn);
    container.appendChild(createBtnEl);
    container.appendChild(rmsBtn);
    container.appendChild(delayBtn);
    document.body.appendChild(container);
  }

  // =========================================================================
  // Freshdesk Automation: New Ticket Page -> Pre-fill Contact/Requester Field
  // =========================================================================
  if (window.location.pathname.startsWith('/a/tickets/new')) {
    const usp = new URLSearchParams(window.location.search);

    // The user explicitly requested to keep the auto-refresh behavior
    if ((usp.has('bf_uid') || usp.has('bf_order_number') || usp.has('contactId')) && !usp.has('bf_reloaded')) {
      usp.set('bf_reloaded', '1');
      window.history.replaceState(null, '', window.location.pathname + '?' + usp.toString());
      window.location.reload();
      return;
    }

    const bfUid = usp.get('bf_uid');
    const bfOrderNumber = usp.get('bf_order_number');
    const bfDeliveryBy = usp.get('bf_delivery_by');
    const bfIsSenior = usp.get('bf_is_senior') === '1';

    if (bfUid) {
      let dropdownOpened = false;
      const fillContact = () => {
        if (!dropdownOpened) {
          const trigger = document.querySelector('[data-test-id="requester"] .ember-power-select-trigger');
          if (trigger) {
            trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
            trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
            trigger.click();
            dropdownOpened = true;
          }
          return false;
        }

        const targetInput = document.querySelector('.ember-power-select-search-input, .ember-basic-dropdown-content input, input[type="search"]');
        if (targetInput && dropdownOpened) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          if (nativeSetter) {
            nativeSetter.call(targetInput, bfUid);
          } else {
            targetInput.value = bfUid;
          }
          
          targetInput.dispatchEvent(new Event('input', { bubbles: true }));
          targetInput.dispatchEvent(new Event('change', { bubbles: true }));
          targetInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter', code: 'Enter' }));
          
          const bfName = usp.get('bf_name');
          const bfEmail = usp.get('bf_email');

          if (bfName || bfEmail) {
            let verifyRetries = 0;
            const verifyInterval = setInterval(() => {
              const options = document.querySelectorAll('.ember-power-select-option, [role="option"]');
              const loadingMsg = document.querySelector('.ember-power-select-option--loading-message');
              
              if (options.length > 0 && !loadingMsg) {
                clearInterval(verifyInterval);
                const optionsArray = Array.from(options);
                const text = optionsArray.map(o => o.textContent).join(' ').toLowerCase();
                const nameMatches = bfName && text.includes(bfName.toLowerCase());
                const emailMatches = bfEmail && text.includes(bfEmail.toLowerCase());
                
                if (nameMatches || emailMatches) {
                  showToast('Customer identity verified successfully.', 'info');
                  const matchingOption = optionsArray.find(o => {
                    const t = o.textContent.toLowerCase();
                    return (bfName && t.includes(bfName.toLowerCase())) || (bfEmail && t.includes(bfEmail.toLowerCase()));
                  });
                  if (matchingOption) matchingOption.click();
                  else options[0].click();
                } else {
                  showToast('Customer data mismatch. Proceeding to next step...', 'error');
                }
              }
              verifyRetries++;
              if (verifyRetries > 20) {
                 clearInterval(verifyInterval);
                 showToast('No search results found. Proceeding to next step...', 'error');
              }
            }, 500);
          }
          return true;
        }
        return false;
      };

      const start = performance.now();
      const MAX_WAIT = 15000; 
      const interval = setInterval(() => {
        if (fillContact()) {
          clearInterval(interval);
        } else if (performance.now() - start > MAX_WAIT) {
          clearInterval(interval);
        }
      }, 500);
    }

    const getDropdownTrigger = (labelSubstring) => {
      let trigger = null;
      const cleanName = labelSubstring.toLowerCase().replace(/\s+/g, '_');
      const testIdContainer = document.querySelector(`[data-test-id*="cf_${cleanName}"]`) || document.querySelector(`[data-test-id*="${cleanName}"]`);
      if (testIdContainer) {
        trigger = testIdContainer.querySelector('.ember-power-select-trigger');
      }
      
      if (!trigger) {
        const labels = Array.from(document.querySelectorAll('label'));
        for (const label of labels) {
          if (label.textContent.toLowerCase().includes(labelSubstring.toLowerCase())) {
            let parent = label.parentElement;
            let attempts = 0;
            while (parent && parent !== document.body && attempts < 4) {
              const t = parent.querySelector('.ember-power-select-trigger');
              if (t) {
                trigger = t;
                break;
              }
              parent = parent.parentElement;
              attempts++;
            }
            if (trigger) break;
          }
        }
      }
      return trigger;
    };

    const isDropdownSelected = (trigger, optionSubstring) => {
       if (!trigger) return false;
       const selectedItem = trigger.querySelector('.ember-power-select-selected-item');
       if (!selectedItem) return false;
       return selectedItem.textContent.trim().toLowerCase() === optionSubstring.toLowerCase();
    };

    const assertDropdown = async (labelSubstring, optionSubstring) => {
      const trigger = getDropdownTrigger(labelSubstring);
      if (!trigger || trigger.disabled || trigger.getAttribute('aria-disabled') === 'true') return false;
      
      // If already selected properly, do nothing!
      if (isDropdownSelected(trigger, optionSubstring)) return true;
      
      return await new Promise((resolve) => {
        const mouseClick = (el) => {
          ['mousedown', 'mouseup', 'click'].forEach((type) => {
            el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
          });
        };
        
        mouseClick(trigger); // Open it

        let attempts = 0;
        const checkIv = setInterval(() => {
          const options = Array.from(document.querySelectorAll('.ember-power-select-option, [role="option"]'));
          const target = options.find(o => (o.textContent || '').trim().toLowerCase() === optionSubstring.toLowerCase());
          if (target) {
            clearInterval(checkIv);
            mouseClick(target); // Select it
            resolve(true);
          } else if (attempts > 30) {
            clearInterval(checkIv);
            document.body.click(); // Close on failure
            resolve(false);
          }
          attempts++;
        }, 50);
      });
    };

    const assertOrderNumber = () => {
      if (!bfOrderNumber) return true;
      let targetOrderInput = null;

      const container = document.querySelector('[data-test-id*="cf_order_number"], [data-test-id*="cf_order_id"], [data-test-id*="order"]');
      if (container) {
        const input = container.querySelector('input:not([type="hidden"])');
        if (input && !input.classList.contains('ember-power-select-search-input')) {
          targetOrderInput = input;
        }
      }

      if (!targetOrderInput) {
        const labels = Array.from(document.querySelectorAll('label'));
        for (const label of labels) {
          const labelText = (label.textContent || '').trim().toLowerCase();
          if (labelText.includes('order number') || labelText.includes('order id')) {
            const forAttr = label.getAttribute('for');
            if (forAttr) {
              targetOrderInput = document.getElementById(forAttr);
              if (targetOrderInput) break;
            }
            let parent = label.parentElement;
            let attempts = 0;
            while (parent && parent !== document.body && attempts < 4) {
              const inputs = Array.from(parent.querySelectorAll('input:not([type="hidden"])'));
              const validInputs = inputs.filter(i => !i.classList.contains('ember-power-select-search-input') && i.type !== 'checkbox' && i.type !== 'radio');
              if (validInputs.length > 0) {
                targetOrderInput = validInputs[0];
                break;
              }
              parent = parent.parentElement;
              attempts++;
            }
            if (targetOrderInput) break;
          }
        }
      }

      if (!targetOrderInput) {
        const orderInputs = Array.from(document.querySelectorAll('input:not([type="hidden"])'));
        targetOrderInput = orderInputs.find(inp => {
          const placeholder = (inp.placeholder || '').toLowerCase();
          const name = (inp.name || '').toLowerCase();
          const aria = (inp.getAttribute('aria-label') || '').toLowerCase();
          if (placeholder.includes('requester') || aria.includes('requester') || inp.classList.contains('ember-power-select-search-input')) return false;
          return placeholder.includes('order number') || placeholder.includes('order id') || name.includes('order') || aria.includes('order');
        });
      }

      if (targetOrderInput && !targetOrderInput.disabled) {
        // Only write if it's not already correct (allows the user to edit it if they want)
        if (targetOrderInput.value && targetOrderInput.value.includes(bfOrderNumber)) return true;
        
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        if (nativeSetter) {
           nativeSetter.call(targetOrderInput, bfOrderNumber);
        } else {
           targetOrderInput.value = bfOrderNumber;
        }
        targetOrderInput.dispatchEvent(new Event('input', { bubbles: true }));
        targetOrderInput.dispatchEvent(new Event('change', { bubbles: true }));
        targetOrderInput.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
      }
      return false;
    };

    const assertSubject = () => {
      if (!bfOrderNumber) return true;
      const s = document.querySelector('input[data-test-id="ticket-subject"], input[name*="subject" i], #helpdesk_ticket_subject');
      if (s && !s.disabled) {
        // If the subject already contains the order number, do not wipe it
        // This allows the user to start typing "Complaint XX - ..." immediately
        if (s.value && s.value.includes(bfOrderNumber)) return true;
        
        const subjectVal = `XX - ${bfOrderNumber}`;
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        if (nativeSetter) nativeSetter.call(s, subjectVal);
        else s.value = subjectVal;
        
        s.dispatchEvent(new Event('input', { bubbles: true }));
        s.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    };

    const assertDescription = () => {
      try {
        if (!bfIsSenior) return true;
        
        const editor = document.querySelector('.fr-element.fr-view, .redactor-editor, .ql-editor');
        if (!editor) return false;

        const templateHtml = 'Amount:&nbsp;<br>Reason:&nbsp;<br>Switcher:&nbsp;<br>Order Link:&nbsp;<br>Item Name:&nbsp;<br>Accountability: Breadfast Restaurant';
        
        const currentText = (editor.textContent || '').trim();
        if (currentText === '') {
          editor.innerHTML = templateHtml;
          editor.dispatchEvent(new Event('input', { bubbles: true }));
          editor.dispatchEvent(new Event('change', { bubbles: true }));
          
          const wrapper = editor.closest('.fr-box');
          if (wrapper) {
            wrapper.dispatchEvent(new Event('froala.contentChanged', { bubbles: true }));
          }
        }
        return true;
      } catch(e) {
        return false;
      }
    };

    const runAutomations = () => {
      let runAttempts = 0;
      
      const syncState = async () => {
        await Promise.resolve(assertOrderNumber());
        await assertDropdown('Business unit', 'Food Aggregation');
        if (bfDeliveryBy) {
          await assertDropdown('Delivery By', bfDeliveryBy);
        }
        await Promise.resolve(assertSubject());
        await Promise.resolve(assertDescription());
      };

      const masterIv = setInterval(async () => {
        // Chrome pauses rendering in background tabs. We must wait until the form actually appears.
        const formIsRendered = document.querySelector('input[data-test-id="ticket-subject"], input[name*="subject" i], #helpdesk_ticket_subject');
        
        if (!formIsRendered) {
          return; // Keep waiting infinitely until the tab is focused and Ember renders the form
        }

        // Once the form is visible, we sync state for 12.5 seconds
        if (runAttempts > 25) { 
          clearInterval(masterIv);
          return;
        }
        runAttempts++;
        
        // Prevent concurrent syncs from spam-clicking dropdowns
        if (window.__bfSyncing) return;
        window.__bfSyncing = true;
        await syncState();
        window.__bfSyncing = false;
      }, 500);
    };

    runAutomations();
  }

  // =========================================================================
  // Freshdesk Logic
  // =========================================================================
  if (window.location.host.includes('freshdesk')) {
    const freshIv = setInterval(() => {
      if (document.body) {
        ensureButtons();
      }
    }, 500);

    try {
      if (document.documentElement) {
        const observer = new MutationObserver(() => ensureButtons());
        observer.observe(document.documentElement, { childList: true, subtree: true });
      }
    } catch (e) {}

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', ensureButtons);
    } else {
      ensureButtons();
    }
  }
})();
