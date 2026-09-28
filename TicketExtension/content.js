(function () {
  'use strict';

  const isFreshdesk = window.location.host.includes('freshdesk');
  const isBreadfastAdmin = window.location.host.includes('breadfast.com') &&
    (window.location.pathname.includes('post.php') || window.location.pathname.includes('wp-admin'));
  const isFoodRms = window.location.host.includes('food-rms') ||
    (window.location.host.includes('rms') && window.location.host.includes('breadfast'));

  if (!isFreshdesk && !isBreadfastAdmin && !isFoodRms) {
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

  const isElementVisible = (el) => {
    if (!el) return false;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

    let parent = el.parentElement;
    let depth = 0;
    while (parent && parent !== document.body && depth < 8) {
      const pStyle = window.getComputedStyle(parent);
      if (pStyle.display === 'none' || pStyle.visibility === 'hidden') return false;
      parent = parent.parentElement;
      depth++;
    }
    return true;
  };

  const findDropdownTrigger = (fieldName) => {
    const norm = (fieldName || '').toLowerCase().trim();

    // Helper to extract trigger from an element or its descendants/siblings
    const getTriggerFrom = (el) => {
      if (!el) return null;
      if (el.classList.contains('ember-power-select-trigger')) return el;
      const child = el.querySelector('.ember-power-select-trigger');
      if (child) return child;
      if (el.parentElement) {
        const sibling = el.parentElement.querySelector('.ember-power-select-trigger');
        if (sibling) return sibling;
      }
      return null;
    };

    // Helper: search by label matching a regex pattern
    const getTriggerByLabel = (regex) => {
      const labels = Array.from(document.querySelectorAll('label, .ember-power-select-placeholder'));
      for (const label of labels) {
        const txt = (label.textContent || '').trim().replace(/\s*\*\s*$/, '').trim().toLowerCase();
        if (regex.test(txt)) {
          const forAttr = label.getAttribute('for');
          if (forAttr) {
            const tr = getTriggerFrom(document.getElementById(forAttr));
            if (tr) return tr;
          }
          let p = label.parentElement;
          let depth = 0;
          while (p && p !== document.body && depth < 5) {
            const tr = p.querySelector('.ember-power-select-trigger');
            if (tr) return tr;
            p = p.parentElement;
            depth++;
          }
        }
      }
      return null;
    };

    // 1. Ticket Type
    if (norm === 'type' || norm === 'ticket_type' || norm === 'ticket type') {
      const selectors = [
        '[data-test-id="type" i]',
        '[data-test-id="ticket_type" i]',
        '[data-test-id="ticket-type" i]',
        '[data-test-id="tkt-properties-ticket_type" i]',
        '[data-test-select-field="type" i]',
        '[data-test-select-field="ticket_type" i]',
        '[data-test-id="tkt-type" i]'
      ];
      for (const sel of selectors) {
        const tr = getTriggerFrom(document.querySelector(sel));
        if (tr) return tr;
      }
      const labelTr = getTriggerByLabel(/^type$|^ticket\s*type$/i);
      if (labelTr) return labelTr;
    }

    // 2. Feedback Category (Level 1)
    if (norm === 'feedback category' || (norm.includes('feedback') && (norm.includes('category') || norm.includes('cat')))) {
      const selectors = [
        '[data-test-id*="feedback_category" i]',
        '[data-test-id*="feedback category" i]',
        '[data-test-id*="cf_feedback_category" i]',
        '[data-test-id="level-1" i]',
        '[data-test-id*="level-1" i]',
        '[data-test-id*="level_1" i]',
        '[title*="Feedback Category" i]'
      ];
      for (const sel of selectors) {
        const tr = getTriggerFrom(document.querySelector(sel));
        if (tr && document.body.contains(tr)) return tr;
      }
      const labelTr = getTriggerByLabel(/feedback\s*category/i);
      if (labelTr && document.body.contains(labelTr)) return labelTr;
    }

    // 3. Feedback Details (Level 2)
    if (norm === 'feedback details' || norm === 'feedback detail' || (norm.includes('feedback') && (norm.includes('detail') || norm.includes('sub')))) {
      const selectors = [
        '[data-test-id*="feedback_details" i]',
        '[data-test-id*="feedback details" i]',
        '[data-test-id*="cf_feedback_details" i]',
        '[data-test-id="level-2" i]',
        '[data-test-id*="level-2" i]',
        '[data-test-id*="level_2" i]',
        '.nested-sub-fields [data-test-id*="level-2" i]',
        '[title*="Feedback Details" i]'
      ];
      for (const sel of selectors) {
        const tr = getTriggerFrom(document.querySelector(sel));
        if (tr && document.body.contains(tr)) return tr;
      }
      const nestedContainer = document.querySelector('.nested-sub-fields, .nested-field-group, [data-test-id*="nested" i]');
      if (nestedContainer) {
        const triggers = Array.from(nestedContainer.querySelectorAll('.ember-power-select-trigger'));
        if (triggers.length >= 2 && document.body.contains(triggers[1])) {
          return triggers[1];
        }
      }
      const labelTr = getTriggerByLabel(/feedback\s*detail/i);
      if (labelTr && document.body.contains(labelTr)) return labelTr;
    }

    // 4. Complaint Category (Level 1)
    if (norm === 'complaint category' || (norm.includes('complaint') && (norm.includes('category') || norm.includes('cat'))) || norm === 'category') {
      const selectors = [
        '[data-test-id*="complaint_category" i]',
        '[data-test-id*="complaint category" i]',
        '[data-test-id*="cf_complaint_category" i]',
        '[data-test-id="level-1" i]',
        '[data-test-id*="level-1" i]',
        '[data-test-id*="level_1" i]',
        '[title*="Complaint Category" i]'
      ];
      for (const sel of selectors) {
        const tr = getTriggerFrom(document.querySelector(sel));
        if (tr && document.body.contains(tr)) return tr;
      }
      const labelTr = getTriggerByLabel(/complaint\s*category|^category$/i);
      if (labelTr && document.body.contains(labelTr)) return labelTr;
    }

    // 5. Complaint Details (Level 2)
    if (norm === 'complaint details' || norm === 'complaint detail' || (norm.includes('complaint') && (norm.includes('detail') || norm.includes('sub'))) || norm === 'detail' || norm === 'details' || norm.includes('sub_category') || norm.includes('subcategory')) {
      const selectors = [
        '[data-test-id*="complaint_details" i]',
        '[data-test-id*="complaint details" i]',
        '[data-test-id*="cf_complaint_details" i]',
        '[data-test-id*="sub_category" i]',
        '[data-test-id*="subcategory" i]',
        '[data-test-id*="sub-category" i]',
        '[data-test-id*="cf_sub_category" i]',
        '[data-test-id="level-2" i]',
        '[data-test-id*="level-2" i]',
        '[data-test-id*="level_2" i]',
        '.nested-sub-fields [data-test-id*="level-2" i]',
        '[title*="Complaint Details" i]',
        '[title*="Sub Category" i]',
        '[title*="Sub-category" i]',
        '[title*="Details" i]'
      ];
      for (const sel of selectors) {
        const tr = getTriggerFrom(document.querySelector(sel));
        if (tr && document.body.contains(tr)) return tr;
      }

      // Check 2nd trigger in nested field containers if present
      const nestedContainer = document.querySelector('.nested-sub-fields, .nested-field-group, [data-test-id*="nested" i]');
      if (nestedContainer) {
        const triggers = Array.from(nestedContainer.querySelectorAll('.ember-power-select-trigger'));
        if (triggers.length >= 2 && document.body.contains(triggers[1])) {
          return triggers[1];
        }
      }

      const labelTr = getTriggerByLabel(/complaint\s*detail|sub\s*category|subcategory|sub-category|^details?$|^issue$/i);
      if (labelTr && document.body.contains(labelTr)) return labelTr;
    }

    // 6. Quality (Level 3 - Dependent on Products Quality)
    if (norm === 'quality' || norm.includes('quality') || norm.includes('level-3') || norm.includes('level_3')) {
      const selectors = [
        '[data-test-id*="quality" i]',
        '[data-test-id="level-3" i]',
        '[data-test-id*="level-3" i]',
        '[data-test-id*="level_3" i]',
        '.nested-sub-fields [data-test-id*="level-3" i]',
        '[title*="Quality" i]'
      ];
      for (const sel of selectors) {
        const tr = getTriggerFrom(document.querySelector(sel));
        if (tr && document.body.contains(tr)) return tr;
      }

      // Check 3rd trigger in nested field containers if present
      const nestedContainer = document.querySelector('.nested-sub-fields, .nested-field-group, [data-test-id*="nested" i]');
      if (nestedContainer) {
        const triggers = Array.from(nestedContainer.querySelectorAll('.ember-power-select-trigger'));
        if (triggers.length >= 3 && document.body.contains(triggers[2])) {
          return triggers[2];
        }
      }

      const labelTr = getTriggerByLabel(/^quality$/i);
      if (labelTr && document.body.contains(labelTr)) return labelTr;
    }

    // 7. Business Unit
    if (norm.includes('business unit') || norm.includes('business_unit')) {
      const selectors = [
        '[data-test-id*="business_unit" i]',
        '[data-test-id*="business-unit" i]',
        '[data-test-id*="cf_business_unit" i]',
        '[title*="Business unit" i]'
      ];
      for (const sel of selectors) {
        const tr = getTriggerFrom(document.querySelector(sel));
        if (tr && document.body.contains(tr)) return tr;
      }
      const labelTr = getTriggerByLabel(/business\s*unit/i);
      if (labelTr && document.body.contains(labelTr)) return labelTr;
    }

    // 8. Delivery By
    if (norm.includes('delivery') || norm.includes('delivered')) {
      const selectors = [
        '[data-test-id*="delivery_by" i]',
        '[data-test-id*="delivery-by" i]',
        '[data-test-id*="cf_delivery_by" i]',
        '[data-test-id*="cf_delivery" i]',
        '[data-test-id*="delivery" i]',
        '[data-test-select-field*="delivery" i]',
        '[title*="Delivery by" i]',
        '[title*="Delivery By" i]',
        '[title*="Delivery" i]'
      ];
      for (const sel of selectors) {
        const tr = getTriggerFrom(document.querySelector(sel));
        if (tr && document.body.contains(tr)) return tr;
      }
      const labelTr = getTriggerByLabel(/deliver(?:y|ed)(\s*by)?/i);
      if (labelTr && document.body.contains(labelTr)) return labelTr;
    }

    // 9. General by data-test-id containing clean fieldName (skip short ambiguous words like "type")
    if (norm.length > 4) {
      const cleanName = norm.replace(/\s+/g, '_');
      const testIdCandidates = Array.from(document.querySelectorAll(`[data-test-id*="${cleanName}" i]`));
      for (const container of testIdCandidates) {
        const tr = getTriggerFrom(container);
        if (tr) return tr;
      }
    }

    // 10. General by placeholder / title elements
    const titleCandidates = Array.from(document.querySelectorAll(`[title*="${fieldName}" i]`));
    for (const titleEl of titleCandidates) {
      const parent = titleEl.closest('.__ui-form__select-field, .input, [class*="select"], .ember-view, div');
      if (parent) {
        const tr = parent.querySelector('.ember-power-select-trigger');
        if (tr) return tr;
      }
    }

    // 11. Exact label match fallback
    const fallbackTr = getTriggerByLabel(new RegExp('^' + norm.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i'));
    if (fallbackTr) return fallbackTr;

    return null;
  };

  const isDropdownSelected = (trigger, optionText) => {
    if (!trigger || !optionText) return false;
    const target = optionText.trim().toLowerCase();
    const targetClean = target.replace(/[^a-z0-9]/g, '');
    if (!targetClean) return false;

    // Check selected item container
    const selectedItem = trigger.querySelector('.ember-power-select-selected-item, .trigger-power-select, .ember-power-select-trigger-string');
    if (selectedItem) {
      const cur = (selectedItem.textContent || '').trim().toLowerCase();
      const curClean = cur.replace(/[^a-z0-9]/g, '');
      if (curClean && (cur === target || curClean === targetClean || (cur.length >= target.length && cur.includes(target)))) {
        return true;
      }
    }

    // Check trigger text
    const fullText = (trigger.textContent || '').trim().toLowerCase();
    if (fullText && fullText !== '--' && !fullText.startsWith('select') && !fullText.includes('choose')) {
      const fullClean = fullText.replace(/[^a-z0-9]/g, '');
      if (fullClean && (fullText === target || fullClean === targetClean || (fullText.length >= target.length && fullText.includes(target)))) {
        return true;
      }
    }

    return false;
  };

  const assertDropdown = async (fieldName, optionText, maxWaitMs = 6000) => {
    if (!fieldName || !optionText) return false;

    const startTime = Date.now();

    // Helper to get active, mounted trigger from DOM
    const getLiveTrigger = () => {
      const tr = findDropdownTrigger(fieldName);
      if (tr && document.body.contains(tr) && !tr.disabled && tr.getAttribute('aria-disabled') !== 'true') {
        return tr;
      }
      return null;
    };

    // 1. Wait for trigger to exist and be enabled
    let trigger = null;
    while (Date.now() - startTime < maxWaitMs) {
      trigger = getLiveTrigger();
      if (trigger) break;
      await new Promise(r => setTimeout(r, 30));
    }

    if (!trigger) {
      console.warn(`[BF Extension] Trigger "${fieldName}" not available or disabled.`);
      return false;
    }

    // 2. Already selected?
    if (isDropdownSelected(trigger, optionText)) {
      return true;
    }

    const mouseClick = (el) => {
      ['mousedown', 'mouseup', 'click'].forEach(type => {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      });
    };

    const isDropdownOpen = (tr) => {
      if (!tr) return false;
      if (tr.getAttribute('aria-expanded') === 'true') return true;
      if (tr.classList.contains('ember-basic-dropdown-trigger--expanded') || tr.classList.contains('ember-power-select-trigger--active')) return true;
      const owns = tr.getAttribute('aria-owns') || tr.getAttribute('aria-controls');
      if (owns) {
        const content = document.getElementById(owns);
        if (content && !content.classList.contains('ember-basic-dropdown-content--closed') && content.offsetParent !== null) {
          return true;
        }
      }
      return false;
    };

    // 3. Open dropdown if not already open
    if (!isDropdownOpen(trigger)) {
      mouseClick(trigger);
    }

    const target = optionText.trim().toLowerCase();
    const targetClean = target.replace(/[^a-z0-9]/g, '');

    return await new Promise((resolve) => {
      let attempts = 0;
      let searched = false;

      const checkIv = setInterval(() => {
        // Keep trigger reference alive if Ember re-rendered the component
        if (!document.body.contains(trigger)) {
          const freshTr = getLiveTrigger();
          if (freshTr) trigger = freshTr;
        }

        // Already selected?
        if (isDropdownSelected(trigger, optionText)) {
          clearInterval(checkIv);
          resolve(true);
          return;
        }

        const currentlyOpen = isDropdownOpen(trigger);
        // Retry opening if closed
        if (!currentlyOpen && attempts >= 2 && attempts % 4 === 0) {
          if (trigger) mouseClick(trigger);
        }

        // Query options directly in document!
        const allOptions = Array.from(document.querySelectorAll('.ember-power-select-option, [role="option"]'));

        // Filter out loading messages so we don't prematurely abort while Freshdesk is fetching
        const options = allOptions.filter(o => {
          if (o.classList.contains('ember-power-select-option--loading-message')) return false;
          if (o.classList.contains('ember-power-select-option--no-matches-message')) return false;
          return true;
        });

        // Priority 1: Exact text match or clean alphanumeric match
        let matched = options.find(o => {
          const txt = (o.textContent || '').trim().toLowerCase();
          if (!txt || txt === '--' || txt.startsWith('select')) return false;
          if (txt === target) return true;
          return txt.replace(/[^a-z0-9]/g, '') === targetClean;
        });

        // Priority 2: Starts with or includes
        if (!matched) {
          matched = options.find(o => {
            const txt = (o.textContent || '').trim().toLowerCase();
            if (!txt || txt === '--' || txt.startsWith('select')) return false;
            return txt.startsWith(target) || txt.includes(target);
          });
        }

        if (matched) {
          clearInterval(checkIv);
          // Scroll ONLY the inner dropdown list container, NEVER the window!
          const list = matched.closest('.ember-power-select-options, ul');
          if (list) {
            try {
              list.scrollTop = matched.offsetTop - list.offsetTop;
            } catch (e) { }
          }
          mouseClick(matched);
          setTimeout(() => {
            resolve(isDropdownSelected(trigger, optionText) || true);
          }, 80);
          return;
        }

        // If not found after ~280ms, try typing in search input if one exists
        if (attempts > 8 && !searched && currentlyOpen) {
          searched = true;
          const searchInput = document.querySelector('.ember-power-select-search-input, input[type="search"]');
          if (searchInput) {
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            if (nativeSetter) nativeSetter.call(searchInput, optionText);
            else searchInput.value = optionText;
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.dispatchEvent(new Event('change', { bubbles: true }));
            searchInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter', code: 'Enter' }));
          }
        }

        attempts++;
        if (attempts > 60) {
          clearInterval(checkIv);
          if (isDropdownSelected(trigger, optionText)) {
            resolve(true);
          } else {
            resolve(false);
          }
        }
      }, 35);
    });
  };

  const assertDropdownWithWait = assertDropdown;

  const findSubjectInput = () => {
    // 1. Direct inputs with subject in data-test-id or name or id
    const direct = document.querySelector(
      'input[data-test-id*="subject" i], input[data-test-text-field*="subject" i], ' +
      'input[name*="subject" i], input[id*="subject" i], #helpdesk_ticket_subject'
    );
    if (direct && !direct.disabled) return direct;

    // 2. Container with subject data-test-id
    const containers = Array.from(document.querySelectorAll(
      '[data-test-id*="subject" i], [data-test-field*="subject" i], .ticket-subject, .subject-field'
    ));
    for (const c of containers) {
      const inp = c.querySelector('input:not([type="hidden"])');
      if (inp && !inp.disabled && !inp.classList.contains('ember-power-select-search-input')) {
        return inp;
      }
    }

    // 3. Label matching "Subject" or "Subject *"
    const labels = Array.from(document.querySelectorAll('label'));
    for (const label of labels) {
      const txt = (label.textContent || '').trim().replace(/\s*\*\s*$/, '').trim().toLowerCase();
      if (txt === 'subject') {
        const forAttr = label.getAttribute('for');
        if (forAttr) {
          const inp = document.getElementById(forAttr);
          if (inp && !inp.disabled) return inp;
        }
        let p = label.parentElement;
        let depth = 0;
        while (p && p !== document.body && depth < 4) {
          const inp = p.querySelector('input:not([type="hidden"])');
          if (inp && !inp.disabled && !inp.classList.contains('ember-power-select-search-input')) {
            return inp;
          }
          p = p.parentElement;
          depth++;
        }
      }
    }

    return null;
  };

  const setTicketSubject = (category, detail, subDetail = '') => {
    const s = findSubjectInput();
    if (!s || s.disabled) return false;

    // Get order number from URL params, input fields, or existing subject
    let orderNum = '';
    try {
      const usp = new URLSearchParams(window.location.search);
      orderNum = usp.get('bf_order_number') || '';
    } catch (e) { }

    if (!orderNum) {
      const orderInputs = Array.from(document.querySelectorAll('input:not([type="hidden"])'));
      const orderInput = orderInputs.find(inp => {
        const placeholder = (inp.placeholder || '').toLowerCase();
        const name = (inp.name || '').toLowerCase();
        const aria = (inp.getAttribute('aria-label') || '').toLowerCase();
        const dataTest = (inp.getAttribute('data-test-id') || '').toLowerCase();
        return (placeholder.includes('order') || name.includes('order') || aria.includes('order') || dataTest.includes('order')) &&
          !inp.classList.contains('ember-power-select-search-input');
      });
      if (orderInput && orderInput.value) {
        const m = orderInput.value.match(/(\d{4}-\d{6,})/);
        orderNum = m ? m[1] : orderInput.value.trim();
      }
    }

    if (!orderNum && s.value) {
      const m = s.value.match(/(\d{4}-\d{6,})/);
      if (m) orderNum = m[1];
    }

    let subjectVal = '';
    const cleanCat = category ? category.replace(/^.*? > /, '').trim() : '';
    const cleanDet = detail ? detail.trim() : '';
    const cleanSubDet = subDetail ? subDetail.trim() : '';

    const parts = [];
    if (cleanCat) parts.push(cleanCat);
    if (cleanDet) parts.push(cleanDet);
    if (cleanSubDet) parts.push(cleanSubDet);

    if (parts.length > 0) {
      const text = parts.join(' - ');
      subjectVal = orderNum ? `${text} - ${orderNum}` : text;
    } else if (orderNum) {
      subjectVal = `XX - ${orderNum}`;
    }

    if (!subjectVal) return false;
    if (s.value === subjectVal) return true;

    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    if (nativeSetter) nativeSetter.call(s, subjectVal);
    else s.value = subjectVal;

    s.dispatchEvent(new Event('input', { bubbles: true }));
    s.dispatchEvent(new Event('change', { bubbles: true }));
    s.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  };

  let activeTreePromise = null;
  const applyTreeToForm = async (treeType, category, detail, subDetail = '') => {
    if (!treeType && !category && !detail && !subDetail) return true;

    // Queue or await active execution so concurrent calls never collide
    if (activeTreePromise) {
      try { await activeTreePromise; } catch (e) { }
    }

    const run = async () => {
      // 0. Set Subject immediately
      setTicketSubject(category, detail, subDetail);

      // 1. Set Type (Complaints or Feedback)
      if (treeType) {
        await assertDropdown('Type', treeType, 6000);
        await new Promise(r => setTimeout(r, 120));
      }

      // 2. Set Category and Details
      if ((treeType || '').toLowerCase().includes('complaint')) {
        if (category) {
          await assertDropdown('Complaint Category', category, 6000);
          await new Promise(r => setTimeout(r, 120));
        }

        if (detail) {
          let detailOk = false;
          for (let attempt = 0; attempt < 3 && !detailOk; attempt++) {
            if (attempt > 0) {
              await new Promise(r => setTimeout(r, 200));
            }
            detailOk = await assertDropdown('Complaint Details', detail, 6000);
          }
          if (subDetail) {
            await new Promise(r => setTimeout(r, 120));
            await assertDropdown('Quality', subDetail, 6000);
          }
          setTicketSubject(category, detail, subDetail);
          if (detailOk) {
            showToast(`[Complaints] ${category} > ${detail}${subDetail ? ' > ' + subDetail : ''} applied!`, 'info');
            return true;
          } else {
            console.warn('[BF Extension] Could not select Complaint Details:', detail);
            return false;
          }
        }
      } else if ((treeType || '').toLowerCase().includes('feedback')) {
        if (category) {
          await assertDropdown('Feedback Category', category, 6000);
          await new Promise(r => setTimeout(r, 120));
        }
        if (detail) {
          let detailOk = false;
          for (let attempt = 0; attempt < 3 && !detailOk; attempt++) {
            if (attempt > 0) {
              await new Promise(r => setTimeout(r, 200));
            }
            detailOk = await assertDropdown('Feedback Details', detail, 6000);
          }
          if (subDetail) {
            await new Promise(r => setTimeout(r, 120));
            let qualityOk = false;
            for (let qTry = 0; qTry < 3 && !qualityOk; qTry++) {
              if (qTry > 0) await new Promise(r => setTimeout(r, 200));
              qualityOk = await assertDropdown('Quality', subDetail, 6000);
              if (!qualityOk) {
                qualityOk = await assertDropdown('Feedback Sub-detail', subDetail, 3000);
              }
            }
          }
          setTicketSubject(category, detail, subDetail);
          showToast(`[Feedback] ${category} > ${detail}${subDetail ? ' > ' + subDetail : ''} applied!`, 'info');
          return true;
        }
      }

      setTicketSubject(category, detail, subDetail);
      return true;
    };

    activeTreePromise = run();
    try {
      return await activeTreePromise;
    } finally {
      activeTreePromise = null;
    }
  };

  function ensureButtons() {
    if (!document.body) return;
    if (document.getElementById('bf-custom-ticket-buttons')) return;

    const container = document.createElement('div');
    container.id = 'bf-custom-ticket-buttons';

    // Position fixed at the bottom corner of the page
    container.style.position = 'fixed';
    container.style.bottom = '20px';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '6px';
    container.style.zIndex = '999999';
    container.style.transition = 'left 0.25s ease, right 0.25s ease';

    // Header row with side toggle button (Left/Right)
    const headerRow = document.createElement('div');
    headerRow.style.display = 'flex';
    headerRow.style.width = '100%';
    headerRow.style.marginBottom = '2px';

    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'bf-toggle-pos-btn';
    toggleBtn.setAttribute('type', 'button');
    toggleBtn.style.padding = '3px 8px';
    toggleBtn.style.border = 'none';
    toggleBtn.style.borderRadius = '4px';
    toggleBtn.style.backgroundColor = '#4b5563';
    toggleBtn.style.color = '#ffffff';
    toggleBtn.style.fontSize = '11px';
    toggleBtn.style.fontWeight = 'bold';
    toggleBtn.style.cursor = 'pointer';
    toggleBtn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
    toggleBtn.style.transition = 'background-color 0.2s, transform 0.1s';
    toggleBtn.style.lineHeight = '1.2';
    toggleBtn.style.whiteSpace = 'nowrap';

    toggleBtn.addEventListener('mouseenter', () => {
      toggleBtn.style.backgroundColor = '#374151';
    });
    toggleBtn.addEventListener('mouseleave', () => {
      toggleBtn.style.backgroundColor = '#4b5563';
    });
    toggleBtn.addEventListener('mousedown', () => {
      toggleBtn.style.transform = 'scale(0.93)';
    });
    toggleBtn.addEventListener('mouseup', () => {
      toggleBtn.style.transform = 'scale(1)';
    });

    const getLeftOffset = () => {
      const sidebar = document.querySelector('nav, .app-nav-bar, .page-actions, aside, [role="navigation"]');
      if (sidebar) {
        const rect = sidebar.getBoundingClientRect();
        if (rect.left <= 10 && rect.width > 30 && rect.width < 150) {
          return `${Math.round(rect.right + 15)}px`;
        }
      }
      return '20px';
    };

    let currentSide = 'right';
    let updateTreeMenuPosition = null;
    let updateSheetsMenuPosition = null;
    try {
      currentSide = localStorage.getItem('bf_buttons_position') || 'right';
    } catch (e) { }

    const applyPosition = (side) => {
      currentSide = side;
      try {
        localStorage.setItem('bf_buttons_position', side);
      } catch (e) { }

      if (side === 'left') {
        container.style.left = getLeftOffset();
        container.style.right = 'auto';
        toggleBtn.innerHTML = '⇄ &#9654;'; // ⇄ ▶
        toggleBtn.title = 'Move to right';
        headerRow.style.justifyContent = 'flex-start';
      } else {
        container.style.right = '20px';
        container.style.left = 'auto';
        toggleBtn.innerHTML = '&#9664; ⇄'; // ◀ ⇄
        toggleBtn.title = 'Move to left';
        headerRow.style.justifyContent = 'flex-end';
      }

      if (typeof updateTreeMenuPosition === 'function') {
        updateTreeMenuPosition(side);
      }
      if (typeof updateSheetsMenuPosition === 'function') {
        updateSheetsMenuPosition(side);
      }
    };

    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const nextSide = currentSide === 'right' ? 'left' : 'right';
      applyPosition(nextSide);
    });

    applyPosition(currentSide);
    headerRow.appendChild(toggleBtn);

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

    // Section 1: Ticket Actions (Calm Blue)
    const seniorBtn = createBtn('btn-senior-ticket', 'Senior Ticket', '#2563eb');
    const createBtnEl = createBtn('btn-create-ticket', 'Normal Ticket', '#2563eb');

    // Section 2: Customer & Operations (Calm Teal)
    const rmsBtn = createBtn('btn-rms-order', 'RMS', '#0d9488');
    const smsBtn = createBtn('btn-sms-dashboard', 'SMS', '#0d9488');
    smsBtn.title = 'Send SMS (Breadfast Dashboard)';
    const chatBtn = createBtn('btn-chat-search', 'Chat', '#0d9488');
    chatBtn.title = 'Open Customer Chat (Kairos Search)';

    // Section 3: Tools & Utilities (Calm Violet)
    const delayBtn = createBtn('btn-delay-calc', 'Calculate Delay', '#7c3aed');
    const calcBtn = createBtn('btn-percentage-calc', 'Calc', '#7c3aed');
    calcBtn.title = 'Percentage Calculator';
    const emailBtn = createBtn('btn-email-templates', 'Email', '#7c3aed');
    emailBtn.title = 'Email Templates Generator';

    // Helper to detect if an element is inside Freshdesk conversation comments/notes/threads
    const isInsideConversation = (el) => {
      if (!el) return false;
      // Never block customer contact / requester info fields
      if (el.closest('[data-test-id*="fields-info"], [data-test-id*="requester"], [data-test-id*="contact"], .ticket-requester-info, .requester-info')) {
        return false;
      }
      return Boolean(el.closest(
        '.conversation-item, .ticket-comment, .note-item, .thread-item, ' +
        '.conversation-reply, .redactor-editor, .fr-box, article, .chat-message, ' +
        '.activity-container, .notes-section, [data-test-id*="conversation" i], ' +
        '.ticket-conv-list, .timeline, .conv-item, .conversation__item, .ticket-thread, ' +
        '.ticket-notes, .discussion-container, .note-container, .private-note, .public-note, ' +
        '.ticket-message, .conversation_list, #conversation-list, [data-test-id*="thread" i], ' +
        '[data-test-id="ticket-notes"], [data-test-id="private-note"], [data-test-id="public-note"], ' +
        '[data-test-id*="activity" i], .feed-container, .activity-item'
      ));
    };

    // Helper to detect if an element is inside Freshdesk agent/assignee cards
    const isInsideAgent = (el) => {
      if (!el) return false;
      // Never treat customer contact / requester sidebar fields as agent fields
      if (el.closest('[data-test-id*="fields-info"], [data-test-id*="requester"], [data-test-id*="contact"], .ticket-requester-info, .requester-info, .contact-details')) {
        return false;
      }
      // Strictly match assignee/agent selection widgets - never match workspace or ticket-view wrappers!
      return Boolean(el.closest(
        '[data-test-id="ticket-agent"], [data-test-id="ticket-assignee"], [data-test-id="assignee"], ' +
        '[data-test-id="select-agent"], [data-test-id="agent-dropdown"], [data-test-id="ticket-assignee-field"], ' +
        '.ticket-assignee, .ticket-agent, .assignee-details, .agent-details, .assignee-name'
      ));
    };

    // Helper to extract UID from Breadfast Switcher Link or Freshdesk External ID in sidebar
    function extractUidWithValidation() {
      // 0. Direct Freshdesk Unique External ID field (from user's screenshot)
      const extIdEl = document.querySelector(
        '[data-test-field-content="Unique external ID" i], ' +
        '[data-test-field-content="Unique External ID" i], ' +
        '[data-test-id="fields-info-unique_external_id" i] [data-test-field-content], ' +
        '[data-test-id="fields-info-unique_external_id" i]'
      );
      if (extIdEl && !isInsideConversation(extIdEl) && !isInsideAgent(extIdEl)) {
        const digits = (extIdEl.textContent || '').replace(/[^\d]/g, '');
        if (digits.length >= 3 && digits.length <= 12) return digits;
      }

      // 1. Authoritative Breadfast Switcher Link in sidebar app
      const switcherLinks = Array.from(document.querySelectorAll('a[href*="switcher/?uid="], a[href*="uid="]'))
        .filter(el => !isInsideConversation(el) && !isInsideAgent(el));

      for (const a of switcherLinks) {
        const m = (a.href || a.getAttribute('href') || '').match(/uid=(\d+)/);
        if (m && m[1]) return m[1];
      }

      // 2. Search by "User Profile" button/link
      const userProfileBtn = Array.from(document.querySelectorAll('a, button, span'))
        .filter(el => !isInsideConversation(el) && !isInsideAgent(el))
        .find(el => (el.textContent || '').trim().toLowerCase() === 'user profile');

      if (userProfileBtn) {
        const m = (userProfileBtn.outerHTML || '').match(/uid=(\d+)/);
        if (m && m[1]) return m[1];
      }

      // 3. Fallback: Search elements with "profile" outside conversation and agent
      const profileEls = Array.from(document.querySelectorAll('a, button'))
        .filter(el => !isInsideConversation(el) && !isInsideAgent(el));

      for (const el of profileEls) {
        const txt = (el.textContent || '').trim().toLowerCase();
        if (txt === 'profile') {
          const m = (el.outerHTML || '').match(/uid=(\d+)/) || (el.outerHTML || '').match(/(?:contacts|customers)\/(\d+)/);
          if (m && m[1]) return m[1];
        }
      }

      return null;
    }

    function extractCustomerInfo() {
      let name = '';
      let email = '';

      // Strictly search within requester containers in header/sidebar, never conversation
      const requesterContainers = Array.from(document.querySelectorAll(
        '[data-test-id*="requester" i], .ticket-requester-info, .requester-info, ' +
        '.requester-details, .ticket-details-header, .ticket-header, .requester-name, ' +
        '[data-test-id="contact-info"], .contact-details, [data-test-id*="customer-info" i]'
      )).filter(el => !isInsideConversation(el) && !isInsideAgent(el));

      for (const container of requesterContainers) {
        if (!email) {
          const mailLinks = Array.from(container.querySelectorAll('a[href^="mailto:"]'));
          if (mailLinks.length > 0) {
            email = mailLinks[0].textContent.trim();
          }
        }
        if (!name) {
          const nameEl = container.querySelector('.user-name, .requester-name, [data-test-id*="name" i], h3, h4');
          if (nameEl) name = nameEl.textContent.trim();
        }
      }

      // Fallback email: search links outside conversation and agent
      if (!email) {
        const safeMailLinks = Array.from(document.querySelectorAll('a[href^="mailto:"]'))
          .filter(el => !isInsideConversation(el) && !isInsideAgent(el));
        if (safeMailLinks.length > 0) {
          email = safeMailLinks[0].textContent.trim();
        }
      }

      // Fallback name: search outside conversation and agent
      if (!name) {
        const safeNameEl = Array.from(document.querySelectorAll('.user-name, .requester-name'))
          .find(el => !isInsideConversation(el) && !isInsideAgent(el));
        if (safeNameEl) name = safeNameEl.textContent.trim();
      }

      return { name, email };
    }

    function extractContactId() {
      // 1. First priority: look strictly inside requester containers in header/sidebar
      const requesterContainers = Array.from(document.querySelectorAll(
        '[data-test-id*="requester" i], .ticket-requester-info, .requester-info, ' +
        '.requester-details, .ticket-details-header, .ticket-header, .requester-name, ' +
        '[data-test-id="contact-info"], .contact-details, [data-test-id*="customer-info" i]'
      )).filter(el => !isInsideConversation(el) && !isInsideAgent(el));

      for (const container of requesterContainers) {
        const links = Array.from(container.querySelectorAll('a[href*="/a/contacts/"]'))
          .filter(el => !isInsideAgent(el));
        for (const a of links) {
          const match = (a.getAttribute('href') || '').match(/\/a\/contacts\/(\d+)/);
          if (match) return match[1];
        }
      }

      // 2. Second priority: elements explicitly having requester/customer in class or data-test-id
      const safeLinks = Array.from(document.querySelectorAll('a[href*="/a/contacts/"]'))
        .filter(el => !isInsideConversation(el) && !isInsideAgent(el));

      for (const a of safeLinks) {
        const classOrTestId = ((a.className || '') + ' ' + (a.getAttribute('data-test-id') || '')).toLowerCase();
        if (classOrTestId.includes('requester') || classOrTestId.includes('customer')) {
          const match = (a.getAttribute('href') || '').match(/\/a\/contacts\/(\d+)/);
          if (match) return match[1];
        }
      }

      // NEVER return arbitrary agent links!
      return null;
    }

    function extractCustomerId() {
      // 1. Try UID from switcher, unique external ID, user profile
      const uid = extractUidWithValidation();
      if (uid) return uid;

      // 2. Check sidebar fields by data-test-id
      const testIdEls = Array.from(document.querySelectorAll(
        '[data-test-id*="customer_id" i], [data-test-id*="customer_uid" i], ' +
        '[data-test-id*="unique_external_id" i], [data-test-id*="cf_uid" i]'
      )).filter(el => !isInsideConversation(el) && !isInsideAgent(el));

      for (const el of testIdEls) {
        const digits = (el.textContent || '').replace(/[^\d]/g, '');
        if (digits.length >= 3 && digits.length <= 12) return digits;
      }

      // 3. Check labels in sidebar (e.g. "Customer ID", "User ID", "UID")
      const labels = Array.from(document.querySelectorAll('label, .field-label, dt, th, span, div'))
        .filter(el => !isInsideConversation(el) && !isInsideAgent(el));

      for (const label of labels) {
        const text = (label.textContent || '').trim().toLowerCase();
        if (text === 'customer id' || text === 'user id' || text === 'uid' || text === 'customer uid' || text === 'unique external id') {
          const container = label.closest('.field-container, .form-group, tr, div') || label.parentElement;
          if (container) {
            const valEl = container.querySelector('[data-test-field-content], dd, .value, span, div:not(:first-child)');
            const content = (valEl ? valEl.textContent : container.textContent) || '';
            const digits = content.replace(/[^\d]/g, '');
            if (digits.length >= 3 && digits.length <= 12) return digits;
          }
        }
      }

      // 4. Check links with customerId= or customer_id= or uid= anywhere outside conversation
      const idLinks = Array.from(document.querySelectorAll('a[href*="customerId=" i], a[href*="customer_id=" i], a[href*="uid=" i]'))
        .filter(el => !isInsideConversation(el) && !isInsideAgent(el));

      for (const a of idLinks) {
        const href = a.href || a.getAttribute('href') || '';
        const m = href.match(/(?:customerId|customer_id|uid)=(\d+)/i);
        if (m && m[1]) return m[1];
      }

      // 5. Fallback to Freshdesk contact ID
      const contactId = extractContactId();
      if (contactId) return contactId;

      return null;
    }

    function extractOrderNumber() {
      // 1. Check ticket title / subject in header & sticky header outside conversation
      const headerEls = Array.from(document.querySelectorAll(
        '.ticket-subject, [data-test-id="ticket-subject"], header h1, header h2, .ticket-header, ' +
        '.ticket-sticky-header, [data-test-id="sticky-header"], .sticky-ticket-title, .sub-header'
      )).filter(el => !isInsideConversation(el));

      for (const h of headerEls) {
        const match = (h.textContent || '').match(/(\d{4}-\d{6,})/);
        if (match) return match[1];
      }

      // 2. Look for order number input fields (e.g. edit mode or custom field) outside conversation
      const inputs = Array.from(document.querySelectorAll(
        'input[data-test-text-field*="order_number" i], input[name*="order_number" i], input[id*="order_number" i], [data-test-id*="cf_order_number" i] input'
      )).filter(el => !isInsideConversation(el));

      for (const input of inputs) {
        if (input && input.value) {
          const val = input.value.trim();
          const match = val.match(/(\d{4}-\d{6,})/);
          if (match) return match[1];
          if (val && !val.includes(' ') && val.length >= 8) return val;
        }
      }

      // 3. Look for order number containers in sidebar outside conversation
      const testIdEls = Array.from(document.querySelectorAll(
        '[data-test-id*="order_number" i], [data-test-id*="order_id" i], [data-test-id*="cf_order" i]'
      )).filter(el => !isInsideConversation(el));

      for (const el of testIdEls) {
        const text = (el.textContent || '').trim();
        const match = text.match(/(\d{4}-\d{6,})/);
        if (match) return match[1];
      }

      // 4. Search sidebar labels and values specifically
      const sidebar = document.querySelector(
        '.ticket-properties, [data-test-id*="properties" i], aside, .ticket-details, #ticket-properties, .sidebar-pane'
      );
      if (sidebar) {
        const labels = Array.from(sidebar.querySelectorAll('label, .field-label, dt, .tkt-sidebar-label'));
        for (const label of labels) {
          const lText = (label.textContent || '').toLowerCase();
          if (lText.includes('order number') || lText.includes('order id')) {
            const container = label.closest('.field-container, .form-group, tr, div') || label.parentElement;
            if (container) {
              const m = (container.textContent || '').match(/(\d{4}-\d{6,})/);
              if (m) return m[1];
            }
          }
        }
      }

      return null;
    }

    function extractDeliveryBy() {
      // 1. Check specific Delivery By elements in sidebar outside conversation
      const deliveryEls = Array.from(document.querySelectorAll(
        '[data-test-id*="delivery_by" i], [data-test-id*="cf_delivery" i], [data-test-id*="delivery" i]'
      )).filter(el => !isInsideConversation(el) && !isInsideAgent(el));

      for (const el of deliveryEls) {
        const text = (el.textContent || '').toLowerCase();
        if (text.includes('restaurant')) return 'Restaurant';
        if (text.includes('breadfast')) return 'Breadfast';
      }

      // 2. TreeWalker on entire document (excluding conversation comments and agents)
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      let node;
      let nextIsValue = false;
      while ((node = walker.nextNode())) {
        const parent = node.parentElement;
        if (!parent || isInsideConversation(parent) || isInsideAgent(parent)) continue;

        const text = (node.nodeValue || '').trim().toLowerCase();
        if (text === 'delivery by' || text === 'delivery by:' || text === 'delivered by' || text === 'delivered by:') {
          nextIsValue = true;
          continue;
        }
        if (nextIsValue && text) {
          if (text.includes('restaurant')) return 'Restaurant';
          if (text.includes('breadfast')) return 'Breadfast';
          nextIsValue = false;
        }
      }

      // 3. Scan sidebar container or properties pane
      const sidebar = document.querySelector(
        '.ticket-properties, [data-test-id*="properties" i], aside, .ticket-details, #ticket-properties, .sidebar-pane, .ticket-pane'
      );
      if (sidebar) {
        const sidebarText = sidebar.innerText || '';
        const m = sidebarText.match(/deliver(?:y|ed)\s*by:?\s*(restaurant|breadfast)/i);
        if (m) return m[1].toLowerCase() === 'restaurant' ? 'Restaurant' : 'Breadfast';
      }

      // 4. Scan whole bodyText outside conversation
      const bodyText = document.body ? (document.body.innerText || '') : '';
      const bodyMatch = bodyText.match(/deliver(?:y|ed)\s*by:?\s*(restaurant|breadfast)/i);
      if (bodyMatch) {
        return bodyMatch[1].toLowerCase() === 'restaurant' ? 'Restaurant' : 'Breadfast';
      }

      return null;
    }

    const openTicketPage = (btnEl, origText, extraParams = {}) => {
      btnEl.textContent = 'Creating...';

      const isSenior = origText === 'Senior Ticket';

      // If already on new ticket page, apply actions directly instead of opening another blank page
      if (window.location.pathname.startsWith('/a/tickets/new')) {
        if (isSenior) {
          assertDescription();
          showToast('Senior description template applied.', 'info');
        } else {
          showToast('Already on New Ticket page.', 'info');
        }
        setTimeout(() => btnEl.textContent = origText, 1000);
        return;
      }

      const contactId = extractContactId();
      const orderNumber = extractOrderNumber();
      const deliveryBy = extractDeliveryBy();

      const appendParams = (url) => {
        let res = url;
        if (orderNumber) res += `&bf_order_number=${encodeURIComponent(orderNumber)}`;
        if (deliveryBy) res += `&bf_delivery_by=${encodeURIComponent(deliveryBy)}`;
        if (isSenior) res += `&bf_is_senior=1`;
        for (const [k, v] of Object.entries(extraParams)) {
          if (v !== undefined && v !== null) {
            res += `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
          }
        }
        return res;
      };

      if (contactId) {
        let NEW_TICKET_URL = appendParams(`https://freshdesk.breadfast.com/a/tickets/new?contactId=${contactId}`);
        window.open(NEW_TICKET_URL, '_blank', 'noopener,noreferrer');
      } else {
        const uid = extractUidWithValidation();
        const info = extractCustomerInfo();

        if (uid) {
          let NEW_TICKET_URL = `https://freshdesk.breadfast.com/a/tickets/new?bf_uid=${encodeURIComponent(uid)}`;
          if (info.name) NEW_TICKET_URL += `&bf_name=${encodeURIComponent(info.name)}`;
          if (info.email) NEW_TICKET_URL += `&bf_email=${encodeURIComponent(info.email)}`;
          NEW_TICKET_URL = appendParams(NEW_TICKET_URL);
          window.open(NEW_TICKET_URL, '_blank', 'noopener,noreferrer');
        } else {
          // Resilient fallback: open new ticket with order/delivery/tree params so user only needs to type requester
          let NEW_TICKET_URL = appendParams(`https://freshdesk.breadfast.com/a/tickets/new?`);
          if (info.name) NEW_TICKET_URL += `&bf_name=${encodeURIComponent(info.name)}`;
          if (info.email) NEW_TICKET_URL += `&bf_email=${encodeURIComponent(info.email)}`;
          window.open(NEW_TICKET_URL, '_blank', 'noopener,noreferrer');
          showToast('Opened new ticket with Order details. Please type Requester manually.', 'info');
        }
      }

      setTimeout(() => btnEl.textContent = origText, 2000);
    };

    seniorBtn.addEventListener('click', () => openTicketPage(seniorBtn, 'Senior Ticket'));
    createBtnEl.addEventListener('click', () => openTicketPage(createBtnEl, 'Normal Ticket'));

    function findOrderLink() {
      const safeLinks = Array.from(document.querySelectorAll('a'))
        .filter(el => !isInsideConversation(el));

      for (const a of safeLinks) {
        const text = (a.textContent || '').trim().toLowerCase();
        const href = a.getAttribute('href') || a.href || '';
        if (text === 'order' && (href.includes('post.php') || href.includes('breadfast.com'))) {
          return href.startsWith('http') ? href : (a.href || href);
        }
      }

      for (const a of safeLinks) {
        const href = a.getAttribute('href') || a.href || '';
        if (href.includes('/wp-admin/post.php') || href.includes('breadfast.com/wp-admin')) {
          return href.startsWith('http') ? href : (a.href || href);
        }
      }

      for (const a of safeLinks) {
        const text = (a.textContent || '').trim().toLowerCase();
        if (text === 'order' && a.href && a.href.startsWith('http')) {
          return a.href;
        }
      }

      for (const a of safeLinks) {
        const text = (a.textContent || '').trim().toLowerCase();
        const href = a.getAttribute('href') || a.href || '';
        if (text.includes('order') && href.includes('post.php')) {
          return href.startsWith('http') ? href : (a.href || href);
        }
      }

      return null;
    }

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

    function extractCustomerPhone() {
      // 1. Direct tel: links on Freshdesk (outside agent assignee cards and conversation)
      const telLinks = Array.from(document.querySelectorAll('a[href^="tel:"]'))
        .filter(el => !isInsideAgent(el) && !isInsideConversation(el));
      for (const a of telLinks) {
        const raw = (a.getAttribute('href') || '').replace(/^tel:/i, '').trim();
        const p = formatPhoneForKairos(raw);
        if (p) return p;
      }

      // 2. Direct exact Freshdesk contact sidebar selectors
      const exactSelectors = [
        '[data-test-field-title="Work phone" i]',
        '[data-test-field-title="Mobile phone" i]',
        '[data-test-field-title="Phone" i]',
        '[data-test-field-title="Mobile" i]',
        '[data-test-field-name="work_phone" i]',
        '[data-test-field-name="mobile" i]',
        '[data-test-field-name="phone" i]',
        '[data-test-id="fields-info-phone" i]',
        '[data-test-id="fields-info-mobile" i]',
        '[data-test-id="contact-phone" i]',
        '[data-test-id="contact-mobile" i]',
        '[data-test-id*="phone" i]',
        '[data-test-id*="mobile" i]'
      ];

      for (const sel of exactSelectors) {
        const els = Array.from(document.querySelectorAll(sel))
          .filter(el => !isInsideAgent(el) && !isInsideConversation(el));
        for (const el of els) {
          const container = el.closest('[data-test-id*="field"], .field-container, .ember-view') || el.parentElement;
          const searchIn = container || el;
          const text = (searchIn.textContent || '').trim();
          const p = formatPhoneForKairos(text);
          if (p) return p;
          const m = text.match(/(?:(?:\+?20|0020)[\s\-()]*)?0?1[0125][\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d|\+?\d{10,15}/);
          if (m) {
            const p2 = formatPhoneForKairos(m[0]);
            if (p2) return p2;
          }
        }
      }

      // 3. Search strictly inside requester info card in sidebar
      const requesterContainers = Array.from(document.querySelectorAll(
        '[data-test-id*="requester" i], .ticket-requester-info, .requester-info, ' +
        '.requester-details, [data-test-id="contact-info"], .contact-details, [data-test-id*="customer-info" i]'
      )).filter(el => !isInsideConversation(el) && !isInsideAgent(el));

      for (const container of requesterContainers) {
        const text = (container.textContent || '').trim();
        if (/work\s*phone|phone|mobile|هاتف|موبايل/i.test(text)) {
          const m = text.match(/(?:(?:\+?20|0020)[\s\-()]*)?0?1[0125][\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d/);
          if (m) {
            const phone = formatPhoneForKairos(m[0]);
            if (phone) return phone;
          }
        }
      }

      // 4. Ticket properties custom fields (e.g. cf_phone, cf_customer_phone)
      const propContainers = Array.from(document.querySelectorAll(
        '[data-test-id*="cf_phone" i], [data-test-id*="cf_customer_phone" i], [data-test-id*="cf_mobile" i]'
      )).filter(el => !isInsideConversation(el) && !isInsideAgent(el));

      for (const container of propContainers) {
        const text = (container.textContent || '').trim();
        const m = text.match(/(?:(?:\+?20|0020)[\s\-()]*)?0?1[0125][\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d/);
        if (m) {
          const phone = formatPhoneForKairos(m[0]);
          if (phone) return phone;
        }
      }

      return null;
    }

    function handleChat(btnEl) {
      if (btnEl.dataset.loading === 'true') return;
      btnEl.dataset.loading = 'true';
      const origText = btnEl.textContent;

      let isFinished = false;
      const finish = () => {
        if (isFinished) return;
        isFinished = true;
        clearTimeout(safetyTimer);
        btnEl.textContent = origText;
        btnEl.style.pointerEvents = 'auto';
        btnEl.dataset.loading = 'false';
      };

      const openKairos = (query, label) => {
        showToast(`Customer Chat opened (${label})`, 'info');
        const kairosUrl = `https://kairos.breadfast.com/app/accounts/1/search?q=${encodeURIComponent(query)}`;
        try {
          chrome.runtime.sendMessage({ action: 'open_kairos_search', url: kairosUrl }, () => {
            if (chrome.runtime.lastError) {
              window.open(kairosUrl, '_blank', 'noopener,noreferrer');
            }
          });
        } catch (e) {
          window.open(kairosUrl, '_blank', 'noopener,noreferrer');
        }
      };

      // 1. Instant check for "Work phone" / Contact phone directly on Freshdesk page (0ms!)
      const pagePhone = extractCustomerPhone();
      if (pagePhone) {
        finish();
        openKairos(pagePhone, pagePhone);
        return;
      }

      // 2. Check for UID
      const uid = extractUidWithValidation();

      // 3. Search Phone from Order page
      const orderLink = findOrderLink();
      if (!orderLink) {
        finish();
        // If no order link on page, fallback to UID if available
        if (uid) {
          openKairos(uid, `ID ${uid}`);
          return;
        }
        showToast('Could not find Customer Phone, Order link, or UID on this ticket.', 'error');
        return;
      }

      // Set button to Searching state
      btnEl.textContent = 'Searching...';
      btnEl.style.pointerEvents = 'none';

      // 4.2-second hard safety timeout: button will NEVER stay stuck!
      const safetyTimer = setTimeout(() => {
        if (!isFinished) {
          console.warn('[BF Extension] Chat search safety timeout fired. Resetting button.');
          finish();
          if (uid) {
            openKairos(uid, `ID ${uid}`);
          } else {
            showToast('Search timed out. Please check order page or retry.', 'error');
          }
        }
      }, 4200);

      try {
        chrome.runtime.sendMessage({ action: 'open_chat_search', url: orderLink }, (response) => {
          if (isFinished) return;
          finish();

          if (chrome.runtime.lastError || !response || !response.success || !response.phone) {
            // Phone not found from Order page -> Fallback to searching with UID!
            if (uid) {
              openKairos(uid, `ID ${uid}`);
              return;
            }
            const err = response?.error || chrome.runtime.lastError?.message || 'Failed to find customer phone number from Order page.';
            showToast(err, 'error');
            return;
          }

          showToast(`Customer Chat opened (${response.phone})`, 'info');
        });
      } catch (err) {
        if (!isFinished) {
          finish();
          if (uid) {
            openKairos(uid, `ID ${uid}`);
          } else {
            showToast('Extension error: ' + err.message, 'error');
          }
        }
      }
    }

    chatBtn.addEventListener('click', () => handleChat(chatBtn));

    function handleCalculateDelay(btnEl) {
      if (btnEl.dataset.loading === 'true') return;
      btnEl.dataset.loading = 'true';
      const origText = btnEl.textContent;
      const orderLink = findOrderLink();

      let isFinished = false;
      const finish = () => {
        if (isFinished) return;
        isFinished = true;
        clearTimeout(safetyTimer);
        btnEl.textContent = origText;
        btnEl.style.pointerEvents = 'auto';
        btnEl.dataset.loading = 'false';
      };

      if (!orderLink) {
        finish();
        showToast('Could not find Order link on this ticket.', 'error');
        return;
      }

      btnEl.textContent = 'Calculating...';
      btnEl.style.pointerEvents = 'none';

      // Safety timeout: reset button if background hangs
      const safetyTimer = setTimeout(() => {
        if (!isFinished) {
          finish();
          showToast('Calculation timed out. Please retry.', 'error');
        }
      }, 6000);

      try {
        chrome.runtime.sendMessage({ action: 'calculate_delay', url: orderLink }, (response) => {
          if (isFinished) return;
          finish();

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
      } catch (e) {
        if (!isFinished) {
          finish();
          showToast('Extension error: ' + e.message, 'error');
        }
      }
    }

    delayBtn.addEventListener('click', () => handleCalculateDelay(delayBtn));
    calcBtn.addEventListener('click', () => openPercentageCalcModal());
    emailBtn.addEventListener('click', () => openEmailModal());

    // =========================================================================
    // Percentage Calculator Popup Modal
    // =========================================================================
    function openPercentageCalcModal() {
      // If modal already open, close it (toggle)
      const existing = document.getElementById('bf-calc-overlay');
      if (existing) {
        existing.remove();
        return;
      }

      // Add CSS styles if not yet injected
      if (!document.getElementById('bf-calc-styles')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'bf-calc-styles';
        styleEl.textContent = `
          @keyframes bfCalcFadeIn {
            from { opacity: 0; transform: scale(0.94); }
            to { opacity: 1; transform: scale(1); }
          }
          .bf-calc-chip {
            padding: 4px 10px;
            background: #334155;
            color: #cbd5e1;
            border: 1px solid #475569;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.15s ease;
            user-select: none;
          }
          .bf-calc-chip:hover {
            background: #475569;
            color: #ffffff;
            border-color: #8b5cf6;
            transform: translateY(-1px);
          }
          .bf-calc-chip.active {
            background: #8b5cf6;
            color: #ffffff;
            border-color: #a78bfa;
          }
          .bf-calc-copy-btn {
            padding: 4px 10px;
            background: #334155;
            color: #f8fafc;
            border: 1px solid #475569;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
            cursor: pointer;
            transition: background 0.2s, transform 0.1s;
          }
          .bf-calc-copy-btn:hover {
            background: #475569;
            border-color: #64748b;
          }
          .bf-calc-copy-btn:active {
            transform: scale(0.95);
          }
        `;
        document.head.appendChild(styleEl);
      }

      // Overlay
      const overlay = document.createElement('div');
      overlay.id = 'bf-calc-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(15, 23, 42, 0.65);
        backdrop-filter: blur(4px);
        z-index: 2147483640;
        display: flex;
        justify-content: center;
        align-items: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      `;

      // Modal container
      const modal = document.createElement('div');
      modal.id = 'bf-calc-modal';
      modal.style.cssText = `
        background: #1e293b;
        color: #f8fafc;
        width: 370px;
        max-width: 92vw;
        border-radius: 14px;
        border: 1px solid #334155;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        animation: bfCalcFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      `;

      // Modal Header
      const header = document.createElement('div');
      header.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 18px;
        background: #0f172a;
        border-bottom: 1px solid #334155;
        cursor: grab;
        user-select: none;
      `;

      const titleWrap = document.createElement('div');
      titleWrap.style.cssText = 'display:flex; align-items:center; gap:8px;';
      titleWrap.innerHTML = `
        <span style="font-size: 18px;">🧮</span>
        <div>
          <div style="font-weight: 700; font-size: 14px; color: #f8fafc;">Percentage Calculator</div>
          <div style="font-size: 11px; color: #94a3b8;">Quick calculation tool</div>
        </div>
      `;

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.textContent = '✕';
      closeBtn.style.cssText = `
        background: transparent;
        border: none;
        color: #94a3b8;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 6px;
        transition: color 0.15s, background 0.15s;
      `;
      closeBtn.addEventListener('mouseenter', () => {
        closeBtn.style.color = '#fff';
        closeBtn.style.background = '#334155';
      });
      closeBtn.addEventListener('mouseleave', () => {
        closeBtn.style.color = '#94a3b8';
        closeBtn.style.background = 'transparent';
      });
      const closeModal = () => overlay.remove();
      closeBtn.addEventListener('click', closeModal);

      header.appendChild(titleWrap);
      header.appendChild(closeBtn);
      modal.appendChild(header);

      // Modal Body
      const body = document.createElement('div');
      body.style.cssText = 'padding: 18px; display: flex; flex-direction: column; gap: 14px;';

      // 1. Amount Input
      const amountGroup = document.createElement('div');
      amountGroup.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';
      amountGroup.innerHTML = `
        <label style="font-size: 12px; font-weight: 600; color: #cbd5e1;">Amount:</label>
        <div style="position: relative; display: flex; align-items: center;">
          <input type="number" id="bf-calc-amount" placeholder="e.g. 1000" step="any"
            style="width: 100%; box-sizing: border-box; padding: 10px 12px; background: #0f172a; border: 1px solid #475569; border-radius: 8px; color: #ffffff; font-size: 15px; font-weight: 600; outline: none; transition: border-color 0.2s;" />
        </div>
      `;

      // 2. Percentage Input
      const percentGroup = document.createElement('div');
      percentGroup.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';
      percentGroup.innerHTML = `
        <label style="font-size: 12px; font-weight: 600; color: #cbd5e1;">Percentage:</label>
        <div style="position: relative; display: flex; align-items: center;">
          <input type="number" id="bf-calc-percent" placeholder="e.g. 65" step="any"
            style="width: 100%; box-sizing: border-box; padding: 10px 32px 10px 12px; background: #0f172a; border: 1px solid #475569; border-radius: 8px; color: #ffffff; font-size: 15px; font-weight: 600; outline: none; transition: border-color 0.2s;" />
          <span style="position: absolute; right: 12px; color: #94a3b8; font-weight: bold; font-size: 14px; pointer-events: none;">%</span>
        </div>
      `;

      // Quick Chips (10%, 20%, 25%, 50%, 65%, 70%, 100%)
      const chipsContainer = document.createElement('div');
      chipsContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;';
      const presetPercentages = [10, 20, 25, 50, 65, 70, 100];
      presetPercentages.forEach(val => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'bf-calc-chip';
        chip.textContent = `${val}%`;
        chip.dataset.val = val;
        chipsContainer.appendChild(chip);
      });
      percentGroup.appendChild(chipsContainer);

      // 3. Result Box
      const resultBox = document.createElement('div');
      resultBox.style.cssText = `
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 10px;
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      `;

      resultBox.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; font-weight: 700;">Result</div>
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span id="bf-calc-res-val" style="font-size: 26px; font-weight: 800; color: #10b981; font-family: monospace;">0</span>
            <button type="button" class="bf-calc-copy-btn" id="bf-calc-copy-btn">📋 Copy</button>
          </div>
          <div id="bf-calc-formula" style="font-size: 12px; color: #64748b; font-family: monospace;">0 × 0% = 0</div>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 10px; border-top: 1px dashed #334155;">
          <span style="font-size: 12px; color: #94a3b8; font-weight: 600;">Remaining:</span>
          <span id="bf-calc-res-rem" style="font-size: 16px; font-weight: 700; color: #38bdf8; font-family: monospace;">0</span>
        </div>
      `;

      // 4. Action bar (Clear button)
      const actionRow = document.createElement('div');
      actionRow.style.cssText = 'display: flex; justify-content: flex-end;';
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.textContent = 'Clear';
      clearBtn.style.cssText = `
        padding: 5px 12px;
        background: transparent;
        color: #94a3b8;
        border: 1px solid #475569;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s;
      `;
      clearBtn.addEventListener('mouseenter', () => {
        clearBtn.style.color = '#f87171';
        clearBtn.style.borderColor = '#f87171';
      });
      clearBtn.addEventListener('mouseleave', () => {
        clearBtn.style.color = '#94a3b8';
        clearBtn.style.borderColor = '#475569';
      });
      actionRow.appendChild(clearBtn);

      body.appendChild(amountGroup);
      body.appendChild(percentGroup);
      body.appendChild(resultBox);
      body.appendChild(actionRow);
      modal.appendChild(body);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Elements
      const amountInput = modal.querySelector('#bf-calc-amount');
      const percentInput = modal.querySelector('#bf-calc-percent');
      const resValEl = modal.querySelector('#bf-calc-res-val');
      const formulaEl = modal.querySelector('#bf-calc-formula');
      const remValEl = modal.querySelector('#bf-calc-res-rem');
      const copyBtn = modal.querySelector('#bf-calc-copy-btn');
      const chips = modal.querySelectorAll('.bf-calc-chip');

      const formatNum = (num) => {
        if (isNaN(num)) return '0';
        return Number.isInteger(num) ? String(num) : num.toFixed(2);
      };

      const recalculate = () => {
        const a = parseFloat(amountInput.value);
        const p = parseFloat(percentInput.value);

        // Update active chip state
        chips.forEach(c => {
          if (parseFloat(c.dataset.val) === p) {
            c.classList.add('active');
          } else {
            c.classList.remove('active');
          }
        });

        if (isNaN(a) || isNaN(p)) {
          resValEl.textContent = '0';
          remValEl.textContent = '0';
          formulaEl.textContent = `${formatNum(a || 0)} × ${formatNum(p || 0)}% = 0`;
          return;
        }

        const result = (a * p) / 100;
        const remaining = a - result;

        resValEl.textContent = formatNum(result);
        remValEl.textContent = formatNum(remaining);
        formulaEl.textContent = `${formatNum(a)} × ${formatNum(p)}% = ${formatNum(result)}`;
      };

      amountInput.addEventListener('input', recalculate);
      percentInput.addEventListener('input', recalculate);

      chips.forEach(c => {
        c.addEventListener('click', () => {
          percentInput.value = c.dataset.val;
          recalculate();
          percentInput.focus();
        });
      });

      // Clear button
      clearBtn.addEventListener('click', () => {
        amountInput.value = '';
        percentInput.value = '';
        chips.forEach(c => c.classList.remove('active'));
        recalculate();
        amountInput.focus();
      });

      // Copy result button
      copyBtn.addEventListener('click', () => {
        const text = resValEl.textContent;
        if (!text || text === '0') return;
        navigator.clipboard.writeText(text).then(() => {
          copyBtn.textContent = '✓ Copied!';
          copyBtn.style.background = '#10b981';
          copyBtn.style.borderColor = '#10b981';
          setTimeout(() => {
            copyBtn.textContent = '📋 Copy';
            copyBtn.style.background = '#334155';
            copyBtn.style.borderColor = '#475569';
          }, 1400);
        }).catch(() => {});
      });

      // Close on backdrop click (outside modal)
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          closeModal();
        }
      });

      // Close on Escape key
      const keyHandler = (e) => {
        if (e.key === 'Escape') {
          closeModal();
          window.removeEventListener('keydown', keyHandler);
        }
      };
      window.addEventListener('keydown', keyHandler);

      // Focus highlight on inputs
      [amountInput, percentInput].forEach(inp => {
        inp.addEventListener('focus', () => inp.style.borderColor = '#8b5cf6');
        inp.addEventListener('blur', () => inp.style.borderColor = '#475569');
      });

      // Make draggable
      let isDragging = false;
      let startX = 0, startY = 0;
      let initialLeft = 0, initialTop = 0;

      header.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = modal.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        modal.style.position = 'fixed';
        modal.style.margin = '0';
        modal.style.left = `${initialLeft}px`;
        modal.style.top = `${initialTop}px`;
        header.style.cursor = 'grabbing';
        e.preventDefault();
      });

      const onMouseMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const newX = Math.max(10, Math.min(window.innerWidth - 380, initialLeft + dx));
        const newY = Math.max(10, Math.min(window.innerHeight - 320, initialTop + dy));
        modal.style.left = `${newX}px`;
        modal.style.top = `${newY}px`;
      };

      const onMouseUp = () => {
        if (isDragging) {
          isDragging = false;
          header.style.cursor = 'grab';
        }
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);

      // Focus Amount input automatically
      setTimeout(() => amountInput.focus(), 50);
    }

    // =========================================================================
    // Email Templates Generator Popup Modal
    // =========================================================================
    function openEmailModal() {
      const existing = document.getElementById('bf-email-modal');
      if (existing) {
        existing.remove();
        return;
      }

      const CATEGORIES = [
        'All Categories',
        'No Answer & Contact',
        'Food & Quality',
        'Packaging & Items',
        'Delivery & Driver',
        'Payment & Pricing',
        'Feedback & Replies'
      ];

      const EMAIL_TEMPLATES = [
        // 1. No Answer & Contact
        {
          id: 'no_answer',
          category: 'No Answer & Contact',
          name: 'No answer email (Rating)',
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the rating you submitted recently for order #${p.orderNumber}.
I have tried to reach you over the phone to apologize and resolve it in person. Unfortunately, I am unable to reach you. You can reach out to our team via our in-app support or at CX@breadfast.com to help solve the issue. Please do feel free to request a phone call clarifying a suitable time for it if you’d still prefer that we contact you over the phone.
We’re all more than eager to assist.
Regards,
Breadfast Team`
        },
        {
          id: 'fh_no_answer',
          category: 'No Answer & Contact',
          name: 'FH no answer (Complaint)',
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the complaint you have submitted recently for order #${p.orderNumber}.
I have tried to reach you over the phone to apologize and resolve it in person. Unfortunately, I am unable to reach you. Please do get back to me with a suitable time and number to contact you as soon as possible. You can also reach out to the rest of the team via our in-app chat or at CX@breadfast.com.
We’re all more than eager to assist.
Regards,
Breadfast Team`
        },
        {
          id: 'retention_request_call',
          category: 'No Answer & Contact',
          name: 'Request a call for severe cases (Retention)',
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. Please accept my sincerest apologies for the issue that you faced with your order #${p.orderNumber}.
One of our complaint team members will contact you ASAP.
Once more, we sincerely apologize for any inconvenience we may have caused you, and we are here to assist you at any time.
Regards,
Breadfast Team.`
        },

        // 2. Food & Quality
        {
          id: 'quality_issue',
          category: 'Food & Quality',
          name: 'Quality issue (Taste, filling, topping, rotten, smell)',
          extraFields: [
            { key: 'issueType', label: 'Issue Type', default: 'quality', placeholder: 'quality/filling/topping/taste/smell' },
            { key: 'item', label: 'Product Name', default: 'item', placeholder: 'Product name' },
            { key: 'refundPercent', label: 'Refund %', default: '50%', placeholder: 'e.g. 50%' },
            { key: 'refundAmount', label: 'Refund Amount', default: 'XX EGP', placeholder: 'e.g. 60 EGP' }
          ],
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the rating you recently submitted for order #${p.orderNumber}, as you mentioned that the ${p.issueType || 'quality'} of the ${p.item || 'item'} isn’t up to par.
Please accept my sincerest apologies for the quality of your ${p.item || 'item'}. I assure you that I have escalated this to our quality team to investigate further so that it doesn’t recur. It will be of great assistance in our investigation if you can provide us with a picture of the product.
As a small apology, we refunded you ${p.refundPercent || '50%'} of the total amount, which is ${p.refundAmount || 'XX'}.
Once more, we do apologize greatly for any inconvenience we might have caused you, and we are right here to assist you at any given time. Please feel free to get back to us via this email or via in-app chat.
Regards,
Breadfast Team.`
        },
        {
          id: 'foodborne_poisoning',
          category: 'Food & Quality',
          name: 'Foodborne / Poisoning',
          extraFields: [
            { key: 'item', label: 'Product Name', default: 'food', placeholder: 'Product name' },
            { key: 'voucherAmount', label: 'Voucher Amount', default: '50 EGP', placeholder: 'e.g. 50 EGP' }
          ],
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the rating you submitted recently for order #${p.orderNumber}, since you mentioned that you got sick after eating the ${p.item || 'item'}.
Please accept my sincerest apologies for the issue, and we would like to know if there were any quality issues with the ${p.item || 'item'}.
Also, for more information, please let me know about this quations
1- What symptoms appeared?
2- Time between symptoms appearing and eating?
3- The number of people who ate compared to the people who showed symptoms?
4- Age of the affected consumer?
5- Any allergens for the consumer in the item consumed?
6- Has the customer consumed any food before?
Also, please accept my apologies for this case, and as a small apology, the item amount will be added to your wallet, and an ${p.voucherAmount || 'XX'} voucher will be added to your wallet within 24 hours.
Once more, we do apologize greatly for any inconvenience we might have caused you, and we are right here to assist you at any given time. Please feel free to get back to us.
Awaiting your reply.
Regards,
Breadfast Team.`
        },
        {
          id: 'foreign_objects',
          category: 'Food & Quality',
          name: 'Foreign Objects',
          extraFields: [
            { key: 'foreignObject', label: 'Foreign Object', default: 'foreign object', placeholder: 'hair / insect / etc.' },
            { key: 'item', label: 'Product Name', default: 'product', placeholder: 'Product name' },
            { key: 'refundAmount', label: 'Refund Amount', default: 'item amount', placeholder: 'Refund amount' },
            { key: 'voucherAmount', label: 'Voucher', default: '50 EGP', placeholder: 'Voucher amount' }
          ],
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the rating you submitted recently for order #${p.orderNumber}, since you mentioned there is a ${p.foreignObject || 'foreign object'} in your ${p.item || 'product'}. I have tried to reach you over the phone, but I’m not able to.
Please accept my sincerest apologies for the quality of your ${p.item || 'product'}. I assure you we will take all necessary actions immediately as follows:
We will check all of our available stock to make sure this doesn’t occur again with you or any other customer.
We will take all the actions to prevent this from happening again and get back to you with feedback.
It will be of great assistance in our investigation if you can provide us with a picture of the product.
Once more, we do apologize greatly for any inconvenience we might have caused you, and we are right here to assist you at any given time.
Also, as an apology, I've just refunded you the ${p.refundAmount || 'item'} amount, with ${p.voucherAmount || 'XX'} voucher will be added within 24 hours to your wallet.
Awaiting your feedback.
Regards,
Breadfast team.`
        },
        {
          id: 'size_weight_issue',
          category: 'Food & Quality',
          name: 'Size / Weight issue',
          extraFields: [
            { key: 'item', label: 'Product Name', default: 'product', placeholder: 'Product name' }
          ],
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the rating you submitted recently for order #${p.orderNumber}, since you mentioned that ${p.item || 'product'} is getting smaller every time you order it now.
Please accept my sincerest apologies for the size of your ${p.item || 'product'}. I assure you that I have escalated this issue to our quality team to investigate further with the restaurant for any size changes so that it doesn’t recur. Also, could you please inform us if this is the first time you tried it? We also need a product Photo (On the scale)
We hope you accept our apologies and provide us with your feedback once you order it next time to see if the issue is resolved or not. Please feel free to get back to us.
Regards,
Breadfast Team.`
        },
        {
          id: 'melted_product',
          category: 'Food & Quality',
          name: 'Melted Product',
          extraFields: [
            { key: 'item', label: 'Product Name', default: 'product', placeholder: 'Product name' },
            { key: 'refundAmount', label: 'Refund Amount', default: 'the full amount', placeholder: 'e.g. 50 EGP' }
          ],
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the rating you submitted recently for order #${p.orderNumber}, since you mentioned you received melted ${p.item || 'item'}.
Please accept my sincerest apologies for the state of your ${p.item || 'item'}. I assure you that I have escalated this issue to our delivery team to investigate further so that it doesn’t recur. It will be of great assistance in our investigation if you can provide us with a picture of the melted product.
I have also just refunded you ${p.refundAmount || 'for it'} for it to your Breadfast wallet so you can reorder it at any time, and I will look forward to hearing your feedback.
Once more, we do apologize greatly for any inconvenience we might have caused you, and we are right here to assist you at any given time. Please feel free to get back to us.
Regards,
Breadfast Team.`
        },
        {
          id: 'hot_cold',
          category: 'Food & Quality',
          name: 'Hot / Cold issue',
          extraFields: [
            { key: 'tempReceived', label: 'Received as', default: 'cold', placeholder: 'cold / hot' },
            { key: 'tempExpected', label: 'Expected as', default: 'Hot', placeholder: 'Hot / Cold' },
            { key: 'item', label: 'Item Name', default: 'item', placeholder: 'Product name' },
            { key: 'refundPercent', label: 'Refund %', default: '50%', placeholder: 'e.g. 50%' },
            { key: 'refundAmount', label: 'Refund Amount', default: 'XX EGP', placeholder: 'Amount' }
          ],
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the rating you submitted recently for order #${p.orderNumber}, since you mentioned you received a ${p.tempReceived || 'cold'} ${p.item || 'item'}.
I do apologize immensely for your order not being delivered ${p.tempExpected || 'Hot'}. I assure you that I have escalated this issue to our delivery team for further investigation and immediate action to prevent it from recurring.
Also, I’ve just refunded you ${p.refundPercent || '50%'} of the ${p.item || 'item'}, which is ${p.refundAmount || 'XX'}.
Once more, we sincerely apologize for any inconvenience we may have caused you, and we are here to assist you at any time. Please feel free to get back to us.
Regards,
Breadfast Team.`
        },
        {
          id: 'production_date_preference',
          category: 'Food & Quality',
          name: 'Production date preference',
          extraFields: [
            { key: 'item', label: 'Product Name', default: 'product', placeholder: 'Product name' }
          ],
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you in regards to the rating you submitted recently for order #${p.orderNumber}, since you mentioned that ${p.item || 'product'} is an old production/ packing date.
I do apologize immensely that the production/ packing date doesn’t meet your preference. Allow me to clarify that the restaurant sends the latest date we have available. Regardless, I assure you that I have escalated your feedback to our quality team to take into consideration, if possible.
It will be of great assistance in our investigation if you can provide us with a picture of the product along with its packing/ production date.
Once more, we sincerely apologize for any inconvenience we may have caused you, and we are here to assist you at any time. Please feel free to get back to us.
Regards,
Breadfast Team.`
        },

        // 3. Packaging & Items
        {
          id: 'missing_item',
          category: 'Packaging & Items',
          name: 'Missing item',
          extraFields: [
            { key: 'item', label: 'Missing Item', default: 'item', placeholder: 'Item name' }
          ],
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the rating you recently submitted for order #${p.orderNumber}. You mentioned that you paid for ${p.item || 'an item'}, but it is still missing.
Please accept my sincerest apologies that your order wasn’t delivered in full. I assure you that I have escalated this issue to our Packaging team to investigate further so that it doesn’t recur.
I have added the amount for your missing ${p.item || 'item'}. Also, as a small token of apology, please accept our humble refund for your delivery fees, and feel free to use the balance on any next order by making sure the “use my balance” button is activated on the checkout page. You can always check your updated balance by clicking on the “pay” button.
Once more, we do apologize greatly for any inconvenience we might have caused you, and we are right here to assist you at any given time.
Regards,
Breadfast Team.`
        },
        {
          id: 'missing_wrong_addon',
          category: 'Packaging & Items',
          name: 'Missing add-on / Wrong add-on',
          extraFields: [
            { key: 'item', label: 'Add-on Name', default: 'extra item', placeholder: 'e.g. sauce, cheese' },
            { key: 'missingOrWrong', label: 'Status', default: 'missing', placeholder: 'missing / wrong' },
            { key: 'refundAmount', label: 'Refund Amount', default: 'XX EGP', placeholder: 'e.g. 20 EGP' },
            { key: 'refundDetails', label: 'Refund Details', default: 'XX', placeholder: 'e.g. 20 EGP' }
          ],
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the rating you recently submitted for order #${p.orderNumber}. You mentioned that you paid for extra ${p.item || 'item'}, but it's ${p.missingOrWrong || 'missing'}.
Please accept my sincerest apologies that your order wasn’t delivered in full. I assure you that I have escalated this issue to our quality and packaging team to investigate further so that it doesn’t recur.
Also, I've just refunded you the extra amount of ${p.refundAmount || 'XX'}, which is ${p.refundDetails || p.refundAmount || 'XX'}.
Once more, we sincerely apologize for any inconvenience we may have caused you, and we are here to assist you at any time.
Regards,
Breadfast Team.`
        },
        {
          id: 'wrong_item',
          category: 'Packaging & Items',
          name: 'Wrong item / Order',
          extraFields: [
            { key: 'item', label: 'Wrong Item', default: 'the wrong product', placeholder: 'Item name' }
          ],
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the rating you submitted recently for order #${p.orderNumber}, since you mentioned you received the wrong products.
Please accept my sincerest apologies for not delivering the correct products. I assure you that I have escalated this issue to our packing & delivery team to investigate further so that it doesn’t recur. It will be of great assistance in our investigation if you can provide us with a picture of the wrong products/ order you have received.
Also, I have just refunded you for ${p.item || 'the product'}. Please make sure you refresh the app and click on the “Pay” button to view your updated balance.
Please feel free to get back to us via this email or via in-app chat.
Regards,
Breadfast Team.`
        },
        {
          id: 'spilled_damaged_unsealed',
          category: 'Packaging & Items',
          name: 'Spilled / Damaged / Unsealed item',
          extraFields: [
            { key: 'damageState', label: 'Damage State', default: 'damaged', placeholder: 'smashed / punctured / broken / Spilled / Unsealed' },
            { key: 'item', label: 'Item Name', default: 'product', placeholder: 'Product name' }
          ],
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you in regards to the rating you submitted recently for order #${p.orderNumber}, as you mentioned you received a ${p.damageState || 'damaged'} ${p.item || 'product'}.
Please accept my sincerest apologies for the state of your ${p.item || 'product'}. I assure you that I have escalated this issue to our delivery team to investigate further so that it doesn’t recur. It will be of great assistance in our investigation if you can provide us with a picture of the product. Also, I have just refunded you for ${p.item || 'it'}. Please make sure you refresh the app and click on the “Pay” button to view your updated balance.
Once more, we sincerely apologize for any inconvenience we may have caused you, and we are here to assist you at any time. Please feel free to get back to us via this email or via in-app chat.
Regards,
Breadfast Team.`
        },
        {
          id: 'missing_cutlery',
          category: 'Packaging & Items',
          name: 'Missing cutlery',
          extraFields: [
            { key: 'item', label: 'Item Name', default: 'order', placeholder: 'e.g. order' }
          ],
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the rating you recently submitted for order #${p.orderNumber}. You mentioned that you received the ${p.item || 'order'} without cutlery.
Please accept my sincerest apologies that your order wasn’t delivered in full. I assure you that I have escalated this issue to our Packaging team to investigate further so that it doesn’t recur.
Also, as an apology, I've just refunded you 50 EGP of the ${p.item || 'order'} amount.
Once more, we sincerely apologize for any inconvenience we may have caused you, and we are here to assist you at any time.
Regards,
Breadfast Team.`
        },
        {
          id: 'extra_item',
          category: 'Packaging & Items',
          name: 'Extra item (Gift)',
          extraFields: [
            { key: 'item', label: 'Extra Item', default: 'item', placeholder: 'Extra item name' }
          ],
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the rating you recently submitted for order #${p.orderNumber}. You mentioned that you received Extra ${p.item || 'item'} with your order.
Please accept my sincerest apologies that your order was delivered with an extra item. Please keep it as a gift from breadfast side.
Once more, we sincerely apologize for any inconvenience we may have caused you, and we are here to assist you at any time.
Regards,
Breadfast Team.`
        },
        {
          id: 'dirty_packaging',
          category: 'Packaging & Items',
          name: 'Dirty Packaging',
          extraFields: [
            { key: 'item', label: 'Refund for', default: 'the packaging', placeholder: 'item or packaging' }
          ],
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the rating you submitted recently for order #${p.orderNumber}, as you mentioned that the packaging of your order was Dirty.
Please accept my sincerest apologies for the state of your order. I assure you that I have escalated this issue to our packaging team to investigate further so that it doesn’t recur. It will be of great assistance in our investigation if you can provide us with a picture of the product. Also, I have just refunded you for ${p.item || 'it'}. Please make sure you refresh the app and click on the “Pay” button to view your updated balance.
Once more, we sincerely apologize for any inconvenience we may have caused you, and we are here to assist you at any time. Please feel free to get back to us via this email or via in-app chat.
Regards,
Breadfast Team.`
        },
        {
          id: 'irrelevant_item_same_bag',
          category: 'Packaging & Items',
          name: 'Irrelevant item in same bag',
          extraFields: [
            { key: 'irrelevantItem', label: 'Item 1', default: 'items', placeholder: 'e.g. detergents' },
            { key: 'item', label: 'Item 2 (Food)', default: 'food items', placeholder: 'e.g. bread' },
            { key: 'refundAmount', label: 'Refund Amount', default: 'the extra amount', placeholder: 'e.g. 50 EGP' },
            { key: 'refundDetails', label: 'Refund Details', default: 'XX', placeholder: 'Details' }
          ],
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the rating you submitted recently for order #${p.orderNumber}, since you mentioned that you received ${p.irrelevantItem || 'items'} with the ${p.item || 'items'} in the same bag.
Please accept my sincerest apologies that your order was delivered in the same bag. I assure you that I have escalated this issue to our packaging team to investigate further so that it doesn’t recur. Also, could you please provide us with a photo of the packaging?
Also, I've just refunded you the extra amount of ${p.refundAmount || 'XX'}, which is ${p.refundDetails || p.refundAmount || 'XX'}.
Once more, we sincerely apologize for any inconvenience we may have caused you, and we are here to assist you at any time.
Regards,
Breadfast Team.`
        },
        {
          id: 'coffee_packaging_negative',
          category: 'Packaging & Items',
          name: 'Negative feedback for new coffee packaging',
          extraFields: [
            { key: 'item', label: 'Item Name', default: 'coffee', placeholder: 'coffee' }
          ],
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the rating you submitted recently for order #${p.orderNumber}, since you mentioned that you don't like our new coffee packaging.
Please accept my sincerest apologies for the packaging of your ${p.item || 'coffee'}. I assure you that I have escalated this to our packaging team, but I would like to inform you that we are using new packaging to avoid any spillage issues.
We hope you accept our apologies and provide us with your feedback once you order next time to see if the issue is resolved or not. Please feel free to get back to us.
We’re all more than eager to assist.
Regards,
Breadfast Team`
        },
        {
          id: 'packaging_no_comment',
          category: 'Packaging & Items',
          name: 'Packaging complaint without comment',
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the rating you submitted recently for order #${p.orderNumber}, since you mentioned there is something wrong with the packaging.
I do apologize for any issue you have faced with your order packaging. Would you please clarify more details in this regard so I can help out?
Awaiting your reply.
Regards,
Breadfast Team.`
        },

        // 4. Delivery & Driver
        {
          id: 'order_late',
          category: 'Delivery & Driver',
          name: 'Order is late (Breadfast load)',
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the rating you submitted recently for order #${p.orderNumber}, as it hasn’t been delivered promptly.
Please accept my sincerest apologies for the delay in delivering your order. Please allow me to clarify that we have experienced a huge load of orders, which has impacted our delivery time and has led to your order not being delivered on time. I assure you that I have escalated this delay to our delivery team to investigate further so that it doesn’t recur.
As a small token of apology, please accept our humble refund for your delivery fees, and feel free to use the balance on any future order by making sure the “use my balance” button is activated on the checkout page. You can always check your updated balance by clicking on the “pay” button.
Once more, we sincerely apologize for any inconvenience we may have caused you, and we are here to assist you at any time.
Regards,
Breadfast Team.`
        },
        {
          id: 'late_dbr',
          category: 'Delivery & Driver',
          name: 'Late DBR (Restaurant load)',
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the rating you submitted recently for order #${p.orderNumber}, as it hasn’t been delivered promptly.
Please accept my sincerest apologies for the delay in delivering your order. Please allow me to clarify that the restaurant experienced a huge load of orders, which has impacted to the delivery time and has led to your order not being delivered on time. I assure you that I have escalated this delay to the restaurant delivery team to investigate further so that it doesn’t recur.
As a small token of apology, please accept our humble refund for your delivery fees, and feel free to use the balance on any future order by making sure the “use my balance” button is activated on the checkout page. You can always check your updated balance by clicking on the “pay” button.
Once more, we sincerely apologize for any inconvenience we may have caused you, and we are here to assist you at any time.
Regards,
Breadfast Team.`
        },
        {
          id: 'marked_delivered',
          category: 'Delivery & Driver',
          name: 'Order marked as delivered early',
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I have tried reaching you regarding your rating for order #${p.orderNumber} since you mentioned our delivery associate marked it as completed before it was, but I haven’t been able to reach you.
Please accept my sincerest apologies for the confusion caused by the delivery associate. I assure you that I have escalated this inaccurate status to our delivery associate’s direct manager to investigate further so that it doesn’t recur.
As a small token of apology, please accept our humble refund for your delivery fees so you can have the next one free of delivery charge. Please make sure the “use my balance” button is activated on the checkout page will be added within 24 hours. You can always check your updated balance by clicking on the “pay” button.
Once more, we do apologize greatly for any inconvenience we might have caused you, and we are right here to assist you at any given time. Please feel free to get back to us via this email if you’d still like to receive a call.
Regards,
Breadfast Team.`
        },
        {
          id: 'completed_not_delivered',
          category: 'Delivery & Driver',
          name: 'Completed but not delivered',
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I have tried reaching you regarding your rating for order #${p.orderNumber} since you mentioned our delivery associate marked it as completed before it was, but I’m not able to reach you.
Please accept my sincerest apologies for the confusion caused by the delivery associate. I assure you that I have escalated this inaccurate status to our delivery associate’s direct manager to investigate further so that it doesn’t recur.
As a small token of apology, please accept our humble refund for your delivery fees so you can have the next one free of delivery charges by making sure the “use my balance” button is activated on the checkout page. You can always check your updated balance by clicking on the “pay” button. Also, could you please inform us if you received your order or not?
Once more, we sincerely apologize for any inconvenience we may have caused you, and we are here to assist you at any time. Please feel free to get back to us via this email if you’d still like to receive a call.
Regards,
Breadfast Team.`
        },
        {
          id: 'inappropriate_attitude',
          category: 'Delivery & Driver',
          name: 'Inappropriate Attitude (Delivery)',
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the rating you submitted recently for order #${p.orderNumber}, since you mentioned there is an issue with our delivery associate’s attitude.
Please accept my sincerest apologies for the misconduct caused by the delivery associate. I assure you that I have escalated this issue to our delivery associate’s direct manager to investigate further so that it doesn’t recur.
Once more, we do apologize greatly for any inconvenience we might have caused you, and we are right here to assist you at any given time. Please feel free to get back to us here or via the in-app chat.
Regards,
Breadfast Team.`
        },
        {
          id: 'delivery_no_comment',
          category: 'Delivery & Driver',
          name: 'Delivery issue without comment',
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the rating you submitted recently for order #${p.orderNumber}, since you mentioned there is an issue with our delivery associate.
I do apologize for any trouble our delivery associate has caused you. Would you please provide more details in this regard so I can help out?
Awaiting your reply.
Regards,
Breadfast Team.`
        },
        {
          id: 'unnecessarily_contacting',
          category: 'Delivery & Driver',
          name: 'Unnecessarily contacting customer',
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the rating you submitted recently for order #${p.orderNumber}, since you mentioned that you received many calls from our delivery man.
Please accept my sincerest apologies for any inconvenience. I assure you that I have escalated this issue to our delivery associate’s direct manager to investigate further so that it doesn’t recur.
Once more, we sincerely apologize for any inconvenience we may have caused you, and we are here to assist you at any time. Please feel free to get back to us.
Regards,
Breadfast Team.`
        },

        // 5. Payment & Pricing
        {
          id: 'wrong_collection',
          category: 'Payment & Pricing',
          name: 'Wrong Collection (Change to wallet)',
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you in regards to the rating you submitted recently for order #${p.orderNumber}, since you mentioned that you have paid the order full amount, but the change hasn’t been added to your Breadfast wallet.
Please accept my sincerest apologies that you haven’t received your change yet. I assure you that I have escalated this issue to our delivery associate’s direct manager to investigate further so that it doesn’t recur. I have just refunded you for the remaining change, too. You can always check your updated balance by clicking on the “pay” button.
Once more, we sincerely apologize for any inconvenience we may have caused you, and we are here to assist you at any time. Please feel free to get back to us.
Regards,
Breadfast Team.`
        },
        {
          id: 'no_change',
          category: 'Payment & Pricing',
          name: 'No change with delivery',
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the rating you submitted recently for order #${p.orderNumber}, since you mentioned that our delivery didnt have the change.
Please accept my sincerest apologies for this case and I assure you that I have escalated this issue to our delivery associate’s direct manager to investigate further so that it doesn’t recur.
Once more, we sincerely apologize for any inconvenience we may have caused you, and we are here to assist you at any time. Please feel free to get back to us.
Regards,
Breadfast Team.`
        },
        {
          id: 'expensive_breadfast',
          category: 'Payment & Pricing',
          name: 'Expensive Prices (Breadfast)',
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you in regards to the rating you submitted recently for order #${p.orderNumber}, since you mentioned some products were pricey.
I do apologize immensely that our fresh produce isn’t a match for the quality you have received. Our main goal is to deliver luxurious service that combines both high-quality products and affordable prices. To ensure this happens in the best way, we tend to be picky with our suppliers, especially with Ready Food produce.
To help lighten the load, we often offer promo codes that are shared by SMS, notifications, on social media, in email, or inside the app, so please keep up with us to benefit from our latest offers.
I also assure you that I will share your feedback with our products team to take into consideration.
Regards,
Breadfast Team.`
        },
        {
          id: 'expensive_restaurant',
          category: 'Payment & Pricing',
          name: 'Expensive Prices (Restaurant)',
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you in regards to the rating you submitted recently for order #${p.orderNumber}, since you mentioned some products were pricey.
I would like to inform you that it's related to the restaurant side, as Breadfast is responsible for delivery only.
To help lighten the load, we often offer promo codes that are shared via SMS, notifications, on social media, in email, or inside the app, so please keep up with us to benefit from our latest offers.
I also assure you that I will share your feedback with our product team to take into consideration.
Regards,
Breadfast Team.`
        },
        {
          id: 'price_mismatch_app_restaurant',
          category: 'Payment & Pricing',
          name: 'Price on app doesn’t match menu',
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the rating you submitted recently for order #${p.orderNumber}, since you mentioned some product prices are different than the price on the restaurant menu.
I would like to inform you that it's related to the restaurant side, as Breadfast is responsible for delivery only.
To help lighten the load, we often offer promo codes that are shared via SMS, notifications, on social media, in email, or inside the app, so please keep up with us to benefit from our latest offers.
I also assure you that I will share your feedback with our product team to take into consideration.
Regards,
Breadfast Team.`
        },
        {
          id: 'item_mismatch_picture',
          category: 'Payment & Pricing',
          name: 'Item // Order doesn’t match picture',
          extraFields: [
            { key: 'item', label: 'Item Name', default: 'product', placeholder: 'Product name' },
            { key: 'refundAmount', label: 'Refund Amount', default: 'the delivery fee', placeholder: 'Delivery fee or amount' }
          ],
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the rating you recently submitted for order #${p.orderNumber}. You mentioned that the ${p.item || 'product'} was not like the picture on the app.
Please accept my sincerest apologies that your order wasn’t as shown in the app. I assure you that I have escalated this issue to the restaurant team to investigate further so that it doesn’t recur. It would be of great assistance in our investigation if you could provide us with a picture of the product.
Also, as an apology, I've just refunded you with the delivery fee to your wallet, which is ${p.refundAmount || 'the delivery fee'}
Once more, we do apologize greatly for any inconvenience we might have caused you, and we are right here to assist you at any given time.
Regards,
Breadfast Team.`
        },
        {
          id: 'incorrect_product_data',
          category: 'Payment & Pricing',
          name: 'Incorrect product Data',
          extraFields: [
            { key: 'item', label: 'Item Name', default: 'product', placeholder: 'Product name' },
            { key: 'missingPart', label: 'Delivered without', default: 'description details', placeholder: 'What was missing' },
            { key: 'refundPercent', label: 'Refund %', default: 'XX%', placeholder: 'e.g. 50%' },
            { key: 'refundAmount', label: 'Refund Amount', default: 'XX EGP', placeholder: 'Amount' }
          ],
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the rating you recently submitted for order #${p.orderNumber}. You mentioned that the ${p.item || 'product'} was delivered without ${p.missingPart || 'item'}.
Please accept my sincerest apologies that your order wasn’t delivered in full. I assure you that I have escalated this issue to our Quality team to investigate further so that it doesn’t recur. I have added ${p.refundPercent || 'XX%'} of the ${p.item || 'product'} amount, which is ${p.refundAmount || 'XX'}.
Once more, we do apologize greatly for any inconvenience we might have caused you, and we are right here to assist you at any given time.
Regards,
Breadfast Team.`
        },

        // 6. Feedback & Replies
        {
          id: 'feedback_general',
          category: 'Feedback & Replies',
          name: 'For Feedback cases (Reported to restaurant)',
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the rating you submitted recently for order #${p.orderNumber}.
I would like to inform you that your feedback has been reported to the restaurant to work on it.
We hope you accept our apologies and provide us with your feedback once you order next time to see if the issue is resolved or not. Please feel free to get back to us.
We’re all more than eager to assist.
Regards,
Breadfast Team`
        },
        {
          id: 'special_comment_not_done',
          category: 'Feedback & Replies',
          name: 'Special comment or request not done',
          extraFields: [
            { key: 'specialRequest', label: 'Special Request', default: 'special request', placeholder: 'What was requested' }
          ],
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the rating you submitted recently for order #${p.orderNumber}, since you mentioned that you asked for ${p.specialRequest || 'a special request'} but the order was delivered without it.
Please accept my sincerest apologies for the order being delivered without your comment. We would like to inform you that we can't confirm 100% that your comment will be included. We tried our best to deliver the order as much as we could with your comment.
Once more, we do apologize greatly for any inconvenience we might have caused you, and we are right here to assist you at any given time. Please feel free to get back to us.
Regards,
Breadfast Team.`
        },
        {
          id: 'rate_without_comment',
          category: 'Feedback & Replies',
          name: 'Rate without comment',
          extraFields: [
            { key: 'ratingStars', label: 'Stars Given', default: '1 star', placeholder: 'e.g. 1 star / 2 stars' }
          ],
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you in regards to the rating you recently submitted for order #${p.orderNumber}, since you gave it ${p.ratingStars || '1 star'} without mentioning feedback.
I do apologize for any issues you have faced with your order, dear. Would you please clarify more details in this regard so I can help out?
Awaiting your reply
Regards,
Breadfast Team.`
        },
        {
          id: 'not_clear_comment',
          category: 'Feedback & Replies',
          name: 'Not clear comment',
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding the rating you submitted recently for order #${p.orderNumber}, as you mentioned there is something wrong with some products.
I do apologize for any issues you have faced with your order/ products, dear. Would you please clarify more details in this regard so I can help out?
Awaiting your reply.
Regards,
Breadfast Team.`
        },
        {
          id: 'customer_reply_with_photo',
          category: 'Feedback & Replies',
          name: 'Customer replied with photo or details',
          extraFields: [
            { key: 'responsibleTeam', label: 'Responsible Team', default: 'quality', placeholder: 'quality / packaging / delivery' },
            { key: 'refundPercent', label: 'Refund %', default: '50%', placeholder: 'e.g. 50%' },
            { key: 'item', label: 'Item Name', default: 'item', placeholder: 'Product name' },
            { key: 'refundAmount', label: 'Refund Amount (EGP)', default: '50', placeholder: 'e.g. 50' }
          ],
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. Thanks for your reply.
Your complaint has been reported to our ${p.responsibleTeam || 'quality'} team to take all necessary actions.
Also, as an apology, I've just refunded you ${p.refundPercent || '50%'} of the ${p.item || 'item'} amount, which is ${p.refundAmount || '50'} EGP.
Once more, we sincerely apologize for any inconvenience we may have caused you, and we are here to assist you at any time.
Regards,
Breadfast Team.`
        },
        {
          id: 'customer_reply_without_photo',
          category: 'Feedback & Replies',
          name: 'Customer reply without Photo (Request photo)',
          extraFields: [
            { key: 'responsibleTeam', label: 'Responsible Team', default: 'quality', placeholder: 'quality / packaging / delivery' }
          ],
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. Thanks for your reply.
Your complaint has been reported to our ${p.responsibleTeam || 'quality'} team to take all necessary actions.
Would you please provide us with a photo in this regard so I can help out?
Awaiting your reply.
Regards,
Breadfast Team.`
        },
        {
          id: 'customer_reply_handled_via_chat',
          category: 'Feedback & Replies',
          name: 'Customer reply, but case handled via chat',
          extraFields: [
            { key: 'responsibleTeam', label: 'Responsible Team', default: 'support', placeholder: 'packaging / quality / delivery' }
          ],
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. Thanks for your reply.
Your complaint has been reported to our ${p.responsibleTeam || 'quality'} team to take all necessary actions, and as I see, your complaint has already been handled by our chat team.
If you need any other help, please reach out to us via chat or CX@breadfast.com.
We’re all more than eager to assist.
Regards,
Breadfast Team.`
        },
        {
          id: 'late_chat_reply',
          category: 'Feedback & Replies',
          name: 'Late reply from chatting team',
          render: (p) => `Good ${p.greeting} ${p.customerName},
Hope you’re doing well.
This is ${p.agentName} from Breadfast’s team. I’m contacting you regarding your dissatisfaction with our chat service.
Please accept my sincerest apologies for the wait you have had to go through while contacting our chat team to answer your query. I understand how important it is to provide timely and efficient customer support, and we deeply regret any inconvenience this may have caused you.
Your satisfaction is of utmost priority to us, and we genuinely appreciate your patience and understanding during this time. We have taken note of your query and are committed to resolving it as quickly as possible. Our dedicated team is working diligently to ensure that all pending inquiries are addressed promptly and that we provide you with the necessary assistance.
To help ease the process, we have allocated additional resources to our chat team and have implemented measures to enhance our overall customer support efficiency. We are confident that these steps will reduce response times and improve the quality of our service significantly moving forward.
Once more, we do apologize greatly for any inconvenience we might have caused you, and we are right here to assist you at any given time. Please feel free to get back to us.
Regards,
Breadfast Team.`
        },
        {
          id: 'optional_reply',
          category: 'Feedback & Replies',
          name: 'Short reply (No action needed)',
          render: () => `It’s always my pleasure.
I will be here for any further assistance.
Have a good day.`
        }
      ];

      // Add CSS styles if not yet injected
      if (!document.getElementById('bf-email-styles')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'bf-email-styles';
        styleEl.textContent = `
          @keyframes bfEmailFadeIn {
            from { opacity: 0; transform: scale(0.96); }
            to { opacity: 1; transform: scale(1); }
          }
          .bf-email-chip {
            padding: 5px 12px;
            background: #334155;
            color: #cbd5e1;
            border: 1px solid #475569;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.15s ease;
            user-select: none;
            display: inline-flex;
            align-items: center;
          }
          .bf-email-chip:hover {
            background: #475569;
            color: #ffffff;
            border-color: #ec4899;
          }
          .bf-email-chip.active {
            background: #ec4899;
            color: #ffffff;
            border-color: #f472b6;
            box-shadow: 0 0 8px rgba(236, 72, 153, 0.4);
          }
          .bf-email-input {
            width: 100%;
            box-sizing: border-box;
            padding: 7px 10px;
            background: #0f172a;
            border: 1px solid #475569;
            border-radius: 6px;
            color: #ffffff;
            font-size: 12px;
            font-family: inherit;
            outline: none;
            transition: border-color 0.2s;
          }
          .bf-email-input:focus {
            border-color: #ec4899 !important;
          }
          .bf-email-action-btn {
            padding: 9px 20px;
            background: #ec4899;
            color: #ffffff;
            border: 1px solid #db2777;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: all 0.15s ease;
          }
          .bf-email-action-btn:hover {
            background: #db2777;
            transform: translateY(-1px);
          }
          .bf-email-action-btn:active {
            transform: scale(0.97);
          }
          .bf-email-secondary-btn {
            padding: 8px 14px;
            background: #334155;
            color: #cbd5e1;
            border: 1px solid #475569;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s ease;
            display: inline-flex;
            align-items: center;
            justify-content: center;
          }
          .bf-email-secondary-btn:hover {
            background: #475569;
            color: #ffffff;
            border-color: #64748b;
            transform: translateY(-1px);
          }
          .bf-email-secondary-btn:active {
            transform: scale(0.97);
          }
          .bf-email-scrollbar::-webkit-scrollbar {
            width: 5px;
          }
          .bf-email-scrollbar::-webkit-scrollbar-thumb {
            background: #475569;
            border-radius: 4px;
          }
        `;
        document.head.appendChild(styleEl);
      }

      // Calculate Cairo Time & Greeting
      const getCairoData = () => {
        try {
          const cairoStr = new Date().toLocaleString("en-US", { timeZone: "Africa/Cairo" });
          const d = new Date(cairoStr);
          const h = d.getHours();
          const m = d.getMinutes();
          const ampm = h >= 12 ? 'PM' : 'AM';
          const h12 = h % 12 || 12;
          const timeFormatted = `${h12}:${m < 10 ? '0' + m : m} ${ampm}`;

          let greeting = 'evening';
          if (h >= 5 && h < 12) greeting = 'morning';
          else if (h >= 12 && h < 17) greeting = 'afternoon';

          return { greeting, timeFormatted };
        } catch (e) {
          const h = new Date().getHours();
          let greeting = 'evening';
          if (h >= 5 && h < 12) greeting = 'morning';
          else if (h >= 12 && h < 17) greeting = 'afternoon';
          return { greeting, timeFormatted: '' };
        }
      };

      // Mapping of common Arabic names to standard English transliteration
      const ARABIC_FIRST_NAME_MAP = {
        // Compound / Religious Names
        'عبدالرحمن': 'Abdelrahman', 'عبد الرحمن': 'Abdelrahman',
        'عبدالله': 'Abdallah', 'عبد الله': 'Abdallah',
        'عبدالعزيز': 'Abdelaziz', 'عبد العزيز': 'Abdelaziz',
        'عبدالحميد': 'Abdelhamid', 'عبد الحميد': 'Abdelhamid',
        'عبدالفتاح': 'Abdelfattah', 'عبد الفتاح': 'Abdelfattah',
        'عبدالمنعم': 'Abdelmoneim', 'عبد المنعم': 'Abdelmoneim',
        'عبدالوهاب': 'Abdelwahab', 'عبد الوهاب': 'Abdelwahab',
        'عبدالقادر': 'Abdelkader', 'عبد القادر': 'Abdelkader',
        'عبدالرازق': 'Abdelrazek', 'عبد الرازق': 'Abdelrazek',
        'عبدالسلام': 'Abdelsalam', 'عبد السلام': 'Abdelsalam',
        'عبدالجواد': 'Abdelgawad', 'عبد الجواد': 'Abdelgawad',
        'ابوبكر': 'Abubakr', 'أبو بكر': 'Abubakr', 'ابو بكر': 'Abubakr',
        'سيف الدين': 'Seif', 'سيفالدين': 'Seif',
        'نور الدين': 'Nour', 'نورالدين': 'Nour',
        'ضياء الدين': 'Diaa', 'ضياءالدين': 'Diaa',
        'حسام الدين': 'Hossam', 'علاء الدين': 'Alaa',
        'منة الله': 'Menna', 'منه الله': 'Menna',

        // Males (A-Z)
        'احمد': 'Ahmed', 'أحمد': 'Ahmed', 'إحمد': 'Ahmed',
        'محمد': 'Mohamed', 'محمَّد': 'Mohamed',
        'محمود': 'Mahmoud',
        'مصطفى': 'Mostafa', 'مصطفي': 'Mostafa',
        'علي': 'Ali', 'على': 'Ali',
        'عمر': 'Omar',
        'عمرو': 'Amr',
        'يوسف': 'Youssef',
        'ابراهيم': 'Ibrahim', 'إبراهيم': 'Ibrahim',
        'حسن': 'Hassan',
        'حسين': 'Hussein',
        'خالد': 'Khaled',
        'طارق': 'Tarek',
        'كريم': 'Karim',
        'هشام': 'Hesham',
        'هاني': 'Hany', 'هانى': 'Hany',
        'وائل': 'Wael',
        'وليد': 'Waleed',
        'ياسر': 'Yasser',
        'ياسين': 'Yassin',
        'يحيى': 'Yehia', 'يحيي': 'Yehia',
        'يونس': 'Younis',
        'اسلام': 'Islam', 'إسلام': 'Islam',
        'اشرف': 'Ashraf', 'أشرف': 'Ashraf',
        'ايمن': 'Ayman', 'أيمن': 'Ayman',
        'حسام': 'Hossam',
        'حازم': 'Hazem',
        'حمزة': 'Hamza', 'حمزه': 'Hamza',
        'سامح': 'Sameh',
        'شريف': 'Sherif',
        'عادل': 'Adel',
        'علاء': 'Alaa',
        'عصام': 'Essam',
        'عماد': 'Emad',
        'ماجد': 'Maged',
        'مجدي': 'Magdy', 'مجدى': 'Magdy',
        'مروان': 'Marwan',
        'مدحت': 'Medhat',
        'نادر': 'Nader',
        'نبيل': 'Nabil',
        'باهر': 'Baher',
        'باسل': 'Basel',
        'باسم': 'Bassem',
        'بيتر': 'Peter',
        'جورج': 'George',
        'مينا': 'Mina',
        'كيرلس': 'Kirollos',
        'ابانوب': 'Abanoub', 'أبانوب': 'Abanoub',
        'رامي': 'Ramy', 'رامى': 'Ramy',
        'رضا': 'Reda',
        'سامي': 'Samy', 'سامى': 'Samy',
        'سعيد': 'Saeed',
        'سيف': 'Seif',
        'شادي': 'Shady', 'شادى': 'Shady',
        'صبري': 'Sabry', 'صبرى': 'Sabry',
        'صلاح': 'Salah',
        'ضياء': 'Diaa',
        'عاطف': 'Atef',
        'فارس': 'Fares',
        'فادي': 'Fady', 'فادى': 'Fady',
        'مالك': 'Malek',
        'معتز': 'Moataz',
        'مهند': 'Mohanad',
        'ممدوح': 'Mamdouh',
        'مؤمن': 'Moamen',
        'ناصر': 'Nasser',
        'هيثم': 'Haitham',
        'زياد': 'Ziad',
        'زين': 'Zein',
        'عز': 'Ezz',
        'عزت': 'Ezzat',
        'جلال': 'Galal',
        'جمال': 'Gamal',
        'كمال': 'Kamal',
        'رامز': 'Ramez',
        'تميم': 'Tamim',
        'ادهم': 'Adham', 'أدهم': 'Adham',
        'انس': 'Anas', 'أنس': 'Anas',
        'اكرم': 'Akram', 'أكرم': 'Akram',
        'امجد': 'Amgad', 'أمجد': 'Amgad',
        'امير': 'Amir', 'أمير': 'Amir',
        'ايوب': 'Ayoub', 'أيوب': 'Ayoub',
        'بلال': 'Belal',
        'تامر': 'Tamer',
        'ثروت': 'Tharwat',
        'جابر': 'Gaber',
        'جاسر': 'Gasser',
        'حاتم': 'Hatem',
        'حافظ': 'Hafez',
        'راغب': 'Ragheb',
        'رمزي': 'Ramzy', 'رمزى': 'Ramzy',
        'زكريا': 'Zakaria',
        'سليم': 'Selim',
        'سليمان': 'Soliman',
        'سمير': 'Samir',
        'سيد': 'Sayed',
        'شمس': 'Shams',
        'صابر': 'Saber',
        'صادق': 'Sadek',
        'صبحي': 'Sobhy', 'صبحى': 'Sobhy',
        'صفوت': 'Safwat',
        'طه': 'Taha',
        'طلعت': 'Talaat',
        'عاصم': 'Assem',
        'عزمي': 'Azmy', 'عزمى': 'Azmy',
        'فتحي': 'Fathy', 'فتحى': 'Fathy',
        'فرج': 'Farag',
        'فريد': 'Farid',
        'فكري': 'Fekry', 'فكرى': 'Fekry',
        'فهد': 'Fahd',
        'فوزي': 'Fawzy', 'فوزى': 'Fawzy',
        'فيصل': 'Faisal',
        'مازن': 'Mazen',
        'مختار': 'Mokhtar',
        'مرسي': 'Morsi', 'مرسى': 'Morsi',
        'منصور': 'Mansour',
        'منير': 'Mounir',
        'مهدي': 'Mahdy', 'مهدى': 'Mahdy',
        'ناجي': 'Nagy',
        'وجدي': 'Wagdy', 'وجدى': 'Wagdy',
        'وحيد': 'Waheed',
        'وسيم': 'Waseem',

        // Females
        'سارة': 'Sarah', 'ساره': 'Sarah',
        'نورا': 'Noura', 'نوره': 'Noura', 'نور': 'Nour',
        'ياسمين': 'Yasmin',
        'مريم': 'Mariam',
        'منى': 'Mona',
        'دينا': 'Dina',
        'رنا': 'Rana',
        'ريم': 'Reem',
        'ريهام': 'Reham',
        'رانيا': 'Rania',
        'هبة': 'Heba', 'هبه': 'Heba',
        'هدير': 'Hadeer',
        'مي': 'Mai', 'مى': 'Mai',
        'مروة': 'Marwa', 'مروه': 'Marwa',
        'ميار': 'Mayar',
        'ندى': 'Nada',
        'نهى': 'Noha',
        'هاجر': 'Hager',
        'هديل': 'Hadeel',
        'ولاء': 'Walaa',
        'وفاء': 'Wafaa',
        'يمنى': 'Yomna',
        'اية': 'Aya', 'آية': 'Aya', 'ايه': 'Aya', 'آيه': 'Aya',
        'اسماء': 'Asmaa', 'أسماء': 'Asmaa',
        'اسراء': 'Esraa', 'إسراء': 'Esraa',
        'اميرة': 'Amira', 'أميرة': 'Amira', 'اميره': 'Amira', 'أميره': 'Amira',
        'ايمان': 'Eman', 'إيمان': 'Eman',
        'امنية': 'Omnia', 'أمنية': 'Omnia', 'امنيه': 'Omnia', 'أمنيه': 'Omnia',
        'بسمة': 'Basma', 'بسمه': 'Basma',
        'بسنت': 'Passant',
        'بوسي': 'Bossy', 'بوسى': 'Bossy',
        'تقى': 'Toqa',
        'جنى': 'Jana', 'جنة': 'Jana', 'جنه': 'Jana',
        'جيهان': 'Gihan',
        'حبيبة': 'Habiba', 'حبيبه': 'Habiba',
        'حنان': 'Hanan',
        'خلود': 'Kholoud',
        'داليا': 'Dalia',
        'دعاء': 'Doaa',
        'دنيا': 'Donia',
        'رحاب': 'Rehab',
        'رحمة': 'Rahma', 'رحمه': 'Rahma',
        'رضوى': 'Radwa', 'رضوي': 'Radwa',
        'رقية': 'Roqaya', 'رقيه': 'Roqaya',
        'روان': 'Rawan',
        'روضة': 'Rawda', 'روضه': 'Rawda',
        'زينب': 'Zeinab',
        'سلمى': 'Salma',
        'سمر': 'Samar',
        'سمية': 'Somaya', 'سميه': 'Somaya',
        'سهام': 'Seham',
        'سهيلة': 'Sohaila', 'سهيله': 'Sohaila',
        'شروق': 'Shorouk',
        'شيماء': 'Shaimaa',
        'صفا': 'Safaa',
        'ضحى': 'Doha',
        'علياء': 'Alyaa',
        'غادة': 'Ghada', 'غاده': 'Ghada',
        'فرح': 'Farah',
        'فريدة': 'Farida', 'فريده': 'Farida',
        'فاطمة': 'Fatima', 'فاطمه': 'Fatima',
        'فيروز': 'Fayrouz',
        'كاريمان': 'Kariman',
        'لانا': 'Lana',
        'لمياء': 'Lamia',
        'ليلى': 'Laila', 'ليلي': 'Laila',
        'ماجدة': 'Magda', 'ماجده': 'Magda',
        'مديحة': 'Madiha', 'مديحه': 'Madiha',
        'ميرنا': 'Mirna',
        'ملك': 'Malak',
        'منار': 'Manar',
        'منة': 'Menna', 'منه': 'Menna',
        'مها': 'Maha',
        'نادين': 'Nadine',
        'ناهد': 'Nahed',
        'نجلاء': 'Naglaa',
        'نرمين': 'Nermin',
        'نشوى': 'Nashwa',
        'نيفين': 'Nevin', 'نفين': 'Nevin',
        'نهال': 'Nehal',
        'نورهان': 'Nourhan',
        'هايدي': 'Haidy', 'هايدى': 'Haidy',
        'هالة': 'Hala', 'هاله': 'Hala',
        'هنا': 'Hana', 'هناء': 'Hana',
        'هند': 'Hend',
        'هويدا': 'Howaida', 'هويده': 'Howaida',
        'يارا': 'Yara'
      };

      // Fallback phonetic transliteration for unmapped Arabic names
      const transliterateArabicToLatin = (arabicStr) => {
        if (!arabicStr) return '';
        const charMap = {
          'ا': 'a', 'أ': 'a', 'إ': 'e', 'آ': 'a', 'ء': '', 'ئ': 'y', 'ؤ': 'o',
          'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'g', 'ح': 'h', 'خ': 'kh',
          'د': 'd', 'ذ': 'z', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
          'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh',
          'ف': 'f', 'ق': 'k', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
          'ه': 'h', 'ة': 'a', 'و': 'w', 'ي': 'y', 'ى': 'a'
        };

        let res = '';
        for (let i = 0; i < arabicStr.length; i++) {
          const ch = arabicStr[i];
          res += charMap[ch] !== undefined ? charMap[ch] : ch;
        }
        res = res.replace(/aa+/g, 'a').replace(/yy+/g, 'y');
        if (res.length > 0) {
          res = res.charAt(0).toUpperCase() + res.slice(1).toLowerCase();
        }
        return res;
      };

      // Helper to extract first name and ensure it is ALWAYS in English
      const getFirstName = (fullName) => {
        if (!fullName) return '';
        let cleaned = fullName.trim();

        // Strip common titles / honorifics
        cleaned = cleaned.replace(/^(?:mr\.|mrs\.|ms\.|dr\.|eng\.|mr|mrs|ms|dr|eng)\s+/i, '');
        cleaned = cleaned.replace(/^(?:أستاذ|أستاذة|دكتور|دكتورة|مهندس|مهندسة|أ\.|د\.|م\.)\s+/i, '');
        cleaned = cleaned.trim();

        // Extract first name (accounting for compound Arabic & English names)
        let firstWord = '';
        if (/^عبد\s+\S+/i.test(cleaned)) {
          const match = cleaned.match(/^عبد\s+\S+/);
          firstWord = match ? match[0] : '';
        } else if (/^أبو\s+\S+/i.test(cleaned) || /^ابو\s+\S+/i.test(cleaned)) {
          const match = cleaned.match(/^(?:أبو|ابو)\s+\S+/);
          firstWord = match ? match[0] : '';
        } else if (/^abd\s+el\s+\S+/i.test(cleaned)) {
          const match = cleaned.match(/^abd\s+el\s+\S+/i);
          firstWord = match ? match[0] : '';
        } else if (/^(?:abd|abdel|abdul|abu)\s+\S+/i.test(cleaned)) {
          const match = cleaned.match(/^(?:abd|abdel|abdul|abu)\s+\S+/i);
          firstWord = match ? match[0] : '';
        } else if (/^سيف\s+الدين/i.test(cleaned) || /^نور\s+الدين/i.test(cleaned) || /^ضياء\s+الدين/i.test(cleaned)) {
          const match = cleaned.match(/^\S+\s+الدين/);
          firstWord = match ? match[0] : '';
        } else {
          firstWord = cleaned.split(/\s+/)[0] || '';
        }

        firstWord = firstWord.replace(/[\u064B-\u065F\u0670]/g, '').trim();

        // Check if contains Arabic characters -> Convert to English!
        if (/[\u0600-\u06FF]/.test(firstWord)) {
          // 1. Direct dictionary match
          if (ARABIC_FIRST_NAME_MAP[firstWord]) {
            return ARABIC_FIRST_NAME_MAP[firstWord];
          }
          // 2. Normalized dictionary match (alef, yaa, taa marbouta)
          const normalized = firstWord
            .replace(/[إأآا]/g, 'ا')
            .replace(/[ىي]/g, 'ي')
            .replace(/[ةه]/g, 'ه');
          for (const key of Object.keys(ARABIC_FIRST_NAME_MAP)) {
            const keyNorm = key
              .replace(/[إأآا]/g, 'ا')
              .replace(/[ىي]/g, 'ي')
              .replace(/[ةه]/g, 'ه');
            if (keyNorm === normalized) {
              return ARABIC_FIRST_NAME_MAP[key];
            }
          }
          // 3. Fallback transliteration
          return transliterateArabicToLatin(firstWord);
        }

        // English name normalization (e.g. "AHMED" -> "Ahmed", "ahmed" -> "Ahmed")
        if (firstWord.length > 0) {
          return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
        }

        return '';
      };

      const cairoData = getCairoData();
      let activeGreeting = cairoData.greeting;

      // Extract details from current Freshdesk page
      const custInfo = extractCustomerInfo();
      const rawCustName = (custInfo && custInfo.name) ? custInfo.name.trim() : '';
      let custName = getFirstName(rawCustName);
      let orderNo = extractOrderNumber() || '';
      let agentName = '';
      try {
        agentName = localStorage.getItem('bf_agent_name') || '';
      } catch (e) {}

      // Calculate initial positioning & dimensions
      const initW = 620;
      const initH = Math.min(Math.round(window.innerHeight * 0.84), 690);
      const initRight = 210;
      const initLeft = Math.max(20, window.innerWidth - initRight - initW);
      const initTop = Math.max(25, Math.min(55, window.innerHeight - initH - 30));

      // Floating Non-blocking Resizable Modal Window
      const modal = document.createElement('div');
      modal.id = 'bf-email-modal';
      modal.style.cssText = `
        position: fixed;
        top: ${initTop}px;
        left: ${initLeft}px;
        width: ${initW}px;
        height: ${initH}px;
        min-width: 420px;
        min-height: 380px;
        max-width: calc(100vw - 30px);
        max-height: calc(100vh - 30px);
        background: #1e293b;
        color: #f8fafc;
        border-radius: 12px;
        border: 1px solid #334155;
        box-shadow: 0 16px 36px -6px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.08);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        z-index: 2147483640;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        animation: bfEmailFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        resize: both;
      `;

      // Header
      const header = document.createElement('div');
      header.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 11px 16px;
        background: #0f172a;
        border-bottom: 1px solid #334155;
        cursor: grab;
        user-select: none;
        flex-shrink: 0;
      `;

      const titleWrap = document.createElement('div');
      titleWrap.style.cssText = 'display:flex; align-items:center; gap:8px;';
      titleWrap.innerHTML = `
        <div>
          <div style="font-weight: 700; font-size: 13px; color: #f8fafc;">Email Templates</div>
          <div style="font-size: 11px; color: #94a3b8;" id="bf-email-cairo-info">Cairo Time: <span id="bf-email-cairo-time-text" style="color:#ec4899; font-weight:700;">${cairoData.timeFormatted}</span> (Auto: Good <span id="bf-email-auto-greeting">${cairoData.greeting}</span>)</div>
        </div>
      `;

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.textContent = '✕';
      closeBtn.title = 'Close';
      closeBtn.style.cssText = `
        background: transparent;
        border: none;
        color: #94a3b8;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 6px;
        transition: color 0.15s, background 0.15s;
      `;
      closeBtn.addEventListener('mouseenter', () => { closeBtn.style.color = '#fff'; closeBtn.style.background = '#334155'; });
      closeBtn.addEventListener('mouseleave', () => { closeBtn.style.color = '#94a3b8'; closeBtn.style.background = 'transparent'; });
      const closeModal = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        window.removeEventListener('mousemove', onResizeMouseMove);
        window.removeEventListener('mouseup', onResizeMouseUp);
        window.removeEventListener('keydown', keyHandler);
        modal.remove();
      };
      closeBtn.addEventListener('click', closeModal);

      header.appendChild(titleWrap);
      header.appendChild(closeBtn);
      modal.appendChild(header);

      // Body (Scrollable, flexible height)
      const body = document.createElement('div');
      body.className = 'bf-email-scrollbar';
      body.style.cssText = 'padding: 14px 16px; display: flex; flex-direction: column; gap: 11px; overflow-y: auto; flex: 1; min-height: 0;';

      // 1. Controls Row: Customer Name, Order Number, Agent Name
      const row1 = document.createElement('div');
      row1.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; flex-shrink: 0;';
      row1.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:4px;">
          <label style="font-size:11px; font-weight:600; color:#cbd5e1;">Customer Name:</label>
          <input type="text" id="bf-email-cust-name" class="bf-email-input" value="${custName.replace(/"/g, '&quot;')}" placeholder="e.g. Ahmed" />
        </div>
        <div style="display:flex; flex-direction:column; gap:4px;">
          <label style="font-size:11px; font-weight:600; color:#cbd5e1;">Order Number:</label>
          <input type="text" id="bf-email-order-no" class="bf-email-input" value="${orderNo.replace(/"/g, '&quot;')}" placeholder="e.g. 2809-123456" />
        </div>
        <div style="display:flex; flex-direction:column; gap:4px;">
          <label style="font-size:11px; font-weight:600; color:#cbd5e1;">Agent Name (YY):</label>
          <input type="text" id="bf-email-agent-name" class="bf-email-input" value="${agentName.replace(/"/g, '&quot;')}" placeholder="Your Name" />
        </div>
      `;
      body.appendChild(row1);

      // 2. Greeting Selector Row
      const greetingRow = document.createElement('div');
      greetingRow.style.cssText = 'display:flex; align-items:center; justify-content:space-between; background:#0f172a; padding:7px 12px; border-radius:8px; border:1px solid #334155; flex-shrink: 0;';
      greetingRow.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-size:11px; font-weight:700; color:#cbd5e1;">Greeting:</span>
          <span style="font-size:10px; color:#94a3b8;">(Auto Cairo)</span>
        </div>
        <div style="display:flex; gap:6px;" id="bf-email-greeting-chips">
          <button type="button" class="bf-email-chip ${activeGreeting === 'morning' ? 'active' : ''}" data-val="morning">Morning</button>
          <button type="button" class="bf-email-chip ${activeGreeting === 'afternoon' ? 'active' : ''}" data-val="afternoon">Afternoon</button>
          <button type="button" class="bf-email-chip ${activeGreeting === 'evening' ? 'active' : ''}" data-val="evening">Evening</button>
        </div>
      `;
      body.appendChild(greetingRow);

      // 3. Divided Selection: Category + Template Dropdowns & Search
      const tplRow = document.createElement('div');
      tplRow.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 8px; flex-shrink: 0;';
      tplRow.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:4px;">
          <label style="font-size:11px; font-weight:700; color:#cbd5e1;">Category:</label>
          <select id="bf-email-cat-select" class="bf-email-input" style="cursor:pointer; font-size:12px; font-weight:600; padding:7px 8px;">
          </select>
        </div>
        <div style="display:flex; flex-direction:column; gap:4px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <label style="font-size:11px; font-weight:700; color:#cbd5e1;">Template:</label>
            <input type="text" id="bf-email-search" placeholder="Search..." style="width:110px; padding:3px 6px; font-size:11px; background:#0f172a; border:1px solid #475569; border-radius:4px; color:#fff; outline:none;" />
          </div>
          <select id="bf-email-tpl-select" class="bf-email-input" style="cursor:pointer; font-size:12px; font-weight:600; padding:7px 8px;">
          </select>
        </div>
      `;
      body.appendChild(tplRow);

      // 4. Dynamic Extra Variables Row (Container)
      const extraFieldsContainer = document.createElement('div');
      extraFieldsContainer.id = 'bf-email-extra-fields';
      extraFieldsContainer.style.cssText = 'display:none; flex-wrap:wrap; gap:8px; background:#0f172a; padding:10px 12px; border-radius:8px; border:1px solid #334155; flex-shrink: 0;';
      body.appendChild(extraFieldsContainer);

      // 5. Live Preview Textarea (Flex-grow with window height)
      const previewGroup = document.createElement('div');
      previewGroup.style.cssText = 'display:flex; flex-direction:column; gap:4px; flex:1; min-height:140px;';
      previewGroup.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
          <label style="font-size:11px; font-weight:700; color:#94a3b8;">LIVE EMAIL PREVIEW (EDITABLE):</label>
          <span style="font-size:10px; color:#64748b;">Direct edits are preserved</span>
        </div>
        <textarea id="bf-email-preview" class="bf-email-scrollbar" style="width:100%; height:100%; min-height:120px; box-sizing:border-box; padding:10px 12px; background:#0f172a; border:1px solid #475569; border-radius:8px; color:#ffffff; font-size:13px; line-height:1.5; outline:none; resize:none; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; transition:border-color 0.2s;"></textarea>
      `;
      body.appendChild(previewGroup);

      // 6. Action Bar: Reset + Copy Email buttons
      const actionRow = document.createElement('div');
      actionRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-top:2px; flex-shrink:0;';
      actionRow.innerHTML = `
        <button type="button" class="bf-email-secondary-btn" id="bf-email-reset-btn" title="Refresh Customer Name & Order Number from current ticket">Reset</button>
        <button type="button" class="bf-email-action-btn" id="bf-email-copy-btn">Copy Email</button>
      `;
      body.appendChild(actionRow);

      modal.appendChild(body);

      // Corner Resizer Handle (bottom-right)
      const resizerHandle = document.createElement('div');
      resizerHandle.id = 'bf-email-resizer-handle';
      resizerHandle.style.cssText = `
        position: absolute;
        right: 0;
        bottom: 0;
        width: 18px;
        height: 18px;
        cursor: nwse-resize;
        z-index: 100;
        display: flex;
        align-items: flex-end;
        justify-content: flex-end;
        padding: 3px;
        box-sizing: border-box;
      `;
      resizerHandle.innerHTML = `
        <svg width="10" height="10" viewBox="0 0 10 10" style="opacity: 0.5; pointer-events: none;">
          <line x1="8" y1="2" x2="2" y2="8" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" />
          <line x1="8" y1="5" x2="5" y2="8" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      `;
      modal.appendChild(resizerHandle);

      document.body.appendChild(modal);

      // DOM Elements
      const custNameInput = modal.querySelector('#bf-email-cust-name');
      const orderNoInput = modal.querySelector('#bf-email-order-no');
      const agentNameInput = modal.querySelector('#bf-email-agent-name');
      const catSelect = modal.querySelector('#bf-email-cat-select');
      const searchInput = modal.querySelector('#bf-email-search');
      const tplSelect = modal.querySelector('#bf-email-tpl-select');
      const previewText = modal.querySelector('#bf-email-preview');
      const resetBtn = modal.querySelector('#bf-email-reset-btn');
      const copyBtn = modal.querySelector('#bf-email-copy-btn');
      const greetingChips = modal.querySelectorAll('.bf-email-chip');

      // Populate Category Dropdown
      CATEGORIES.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        catSelect.appendChild(opt);
      });

      // Populate Template Dropdown based on chosen category and search
      const populateTemplateDropdown = (catFilter = 'All Categories', searchQuery = '') => {
        const query = searchQuery.toLowerCase().trim();
        tplSelect.innerHTML = '';

        const filtered = EMAIL_TEMPLATES.filter(tpl => {
          const matchCat = (catFilter === 'All Categories') || (tpl.category === catFilter);
          const matchQuery = !query || tpl.name.toLowerCase().includes(query) || tpl.category.toLowerCase().includes(query);
          return matchCat && matchQuery;
        });

        if (filtered.length === 0) {
          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = 'No matching templates';
          tplSelect.appendChild(opt);
          return;
        }

        // If All Categories, group by category
        if (catFilter === 'All Categories') {
          const grouped = {};
          filtered.forEach(tpl => {
            if (!grouped[tpl.category]) grouped[tpl.category] = [];
            grouped[tpl.category].push(tpl);
          });
          Object.keys(grouped).forEach(cat => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = cat;
            grouped[cat].forEach(t => {
              const opt = document.createElement('option');
              opt.value = t.id;
              opt.textContent = t.name;
              optgroup.appendChild(opt);
            });
            tplSelect.appendChild(optgroup);
          });
        } else {
          // Single category list
          filtered.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.name;
            tplSelect.appendChild(opt);
          });
        }
      };

      // State of extra inputs
      const extraInputValues = {};

      const renderExtraFields = (tpl) => {
        extraFieldsContainer.innerHTML = '';
        if (!tpl || !tpl.extraFields || tpl.extraFields.length === 0) {
          extraFieldsContainer.style.display = 'none';
          return;
        }

        extraFieldsContainer.style.display = 'flex';
        tpl.extraFields.forEach(fld => {
          const wrap = document.createElement('div');
          wrap.style.cssText = 'display:flex; flex-direction:column; gap:3px; flex:1; min-width:120px;';

          const lbl = document.createElement('label');
          lbl.style.cssText = 'font-size:10px; font-weight:700; color:#cbd5e1;';
          lbl.textContent = fld.label + ':';

          const inp = document.createElement('input');
          inp.type = 'text';
          inp.className = 'bf-email-input';
          inp.style.padding = '5px 8px';
          inp.style.fontSize = '11px';
          inp.placeholder = fld.placeholder || '';
          inp.value = extraInputValues[fld.key] !== undefined ? extraInputValues[fld.key] : (fld.default || '');

          inp.addEventListener('input', () => {
            extraInputValues[fld.key] = inp.value;
            updateEmailPreview();
          });

          wrap.appendChild(lbl);
          wrap.appendChild(inp);
          extraFieldsContainer.appendChild(wrap);
        });
      };

      const updateEmailPreview = () => {
        const selectedId = tplSelect.value;
        const tpl = EMAIL_TEMPLATES.find(t => t.id === selectedId) || EMAIL_TEMPLATES[0];
        if (!tpl) {
          previewText.value = '';
          return;
        }

        const rawCust = custNameInput.value.trim();
        const firstName = getFirstName(rawCust) || rawCust || 'XX';

        const params = {
          greeting: activeGreeting,
          customerName: firstName,
          orderNumber: orderNoInput.value.trim() || 'XXX-XXXXXXX',
          agentName: agentNameInput.value.trim() || 'YY',
          ...extraInputValues
        };

        previewText.value = tpl.render(params);
      };

      // Category Change Event
      catSelect.addEventListener('change', () => {
        populateTemplateDropdown(catSelect.value, searchInput.value);
        if (tplSelect.options.length > 0) {
          tplSelect.selectedIndex = 0;
          tplSelect.dispatchEvent(new Event('change'));
        }
      });

      // Search input event
      searchInput.addEventListener('input', () => {
        const prevSelected = tplSelect.value;
        populateTemplateDropdown(catSelect.value, searchInput.value);
        if (Array.from(tplSelect.options).some(o => o.value === prevSelected)) {
          tplSelect.value = prevSelected;
        } else if (tplSelect.options.length > 0) {
          tplSelect.selectedIndex = 0;
          tplSelect.dispatchEvent(new Event('change'));
        }
      });

      // Template Select change event
      tplSelect.addEventListener('change', () => {
        const selectedId = tplSelect.value;
        const tpl = EMAIL_TEMPLATES.find(t => t.id === selectedId);
        Object.keys(extraInputValues).forEach(k => delete extraInputValues[k]);
        if (tpl && tpl.extraFields) {
          tpl.extraFields.forEach(f => {
            extraInputValues[f.key] = f.default || '';
          });
        }
        renderExtraFields(tpl);
        updateEmailPreview();
      });

      // Greeting Chips
      greetingChips.forEach(chip => {
        chip.addEventListener('click', () => {
          greetingChips.forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          activeGreeting = chip.dataset.val;
          updateEmailPreview();
        });
      });

      // Inputs live change
      [custNameInput, orderNoInput].forEach(inp => {
        inp.addEventListener('input', updateEmailPreview);
      });

      custNameInput.addEventListener('blur', () => {
        const converted = getFirstName(custNameInput.value.trim());
        if (converted && converted !== 'XX') {
          custNameInput.value = converted;
          updateEmailPreview();
        }
      });

      agentNameInput.addEventListener('input', () => {
        try {
          localStorage.setItem('bf_agent_name', agentNameInput.value.trim());
        } catch (e) {}
        updateEmailPreview();
      });

      // Reset Button - Refreshes Customer Name & Order Number from current ticket
      resetBtn.addEventListener('click', () => {
        const freshCust = extractCustomerInfo();
        const freshOrder = extractOrderNumber();
        const rawName = (freshCust && freshCust.name) ? freshCust.name.trim() : '';

        custNameInput.value = getFirstName(rawName);
        orderNoInput.value = freshOrder || '';

        // Recalculate Cairo Time & Greeting
        const freshCairo = getCairoData();
        activeGreeting = freshCairo.greeting;
        greetingChips.forEach(chip => {
          chip.classList.toggle('active', chip.dataset.val === activeGreeting);
        });

        const timeDisplay = modal.querySelector('#bf-email-cairo-time-text');
        if (timeDisplay) timeDisplay.textContent = freshCairo.timeFormatted;
        const autoGreetingDisplay = modal.querySelector('#bf-email-auto-greeting');
        if (autoGreetingDisplay) autoGreetingDisplay.textContent = freshCairo.greeting;

        updateEmailPreview();

        resetBtn.textContent = 'Refreshed!';
        resetBtn.style.color = '#10b981';
        resetBtn.style.borderColor = '#10b981';
        setTimeout(() => {
          resetBtn.textContent = 'Reset';
          resetBtn.style.color = '#cbd5e1';
          resetBtn.style.borderColor = '#475569';
        }, 1200);

        showToast('Refreshed Customer & Order from current ticket!', 'info');
      });

      // Copy Button
      copyBtn.addEventListener('click', () => {
        const text = previewText.value;
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
          copyBtn.textContent = 'Copied!';
          copyBtn.style.background = '#10b981';
          copyBtn.style.borderColor = '#10b981';
          setTimeout(() => {
            copyBtn.textContent = 'Copy Email';
            copyBtn.style.background = '#ec4899';
            copyBtn.style.borderColor = '#db2777';
          }, 1400);
        }).catch(() => {});
      });

      // Close on Escape key
      const keyHandler = (e) => {
        if (e.key === 'Escape') {
          closeModal();
        }
      };
      window.addEventListener('keydown', keyHandler);

      // Make draggable
      let isDragging = false;
      let startX = 0, startY = 0;
      let initialLeft = 0, initialTop = 0;

      header.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = modal.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        modal.style.right = 'auto';
        modal.style.left = `${initialLeft}px`;
        modal.style.top = `${initialTop}px`;
        modal.style.margin = '0';
        header.style.cursor = 'grabbing';
        e.preventDefault();
      });

      const onMouseMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const newX = Math.max(10, Math.min(window.innerWidth - 300, initialLeft + dx));
        const newY = Math.max(10, Math.min(window.innerHeight - 150, initialTop + dy));
        modal.style.left = `${newX}px`;
        modal.style.top = `${newY}px`;
      };

      const onMouseUp = () => {
        if (isDragging) {
          isDragging = false;
          header.style.cursor = 'grab';
        }
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);

      // Make resizable via corner grip
      let isResizing = false;
      let resizeStartX = 0, resizeStartY = 0;
      let startW = 0, startH = 0;

      resizerHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizeStartX = e.clientX;
        resizeStartY = e.clientY;
        const rect = modal.getBoundingClientRect();
        startW = rect.width;
        startH = rect.height;
        e.preventDefault();
        e.stopPropagation();
      });

      const onResizeMouseMove = (e) => {
        if (!isResizing) return;
        const dx = e.clientX - resizeStartX;
        const dy = e.clientY - resizeStartY;
        const newW = Math.max(420, Math.min(window.innerWidth - 30, startW + dx));
        const newH = Math.max(380, Math.min(window.innerHeight - 30, startH + dy));
        modal.style.width = `${newW}px`;
        modal.style.height = `${newH}px`;
      };

      const onResizeMouseUp = () => {
        if (isResizing) isResizing = false;
      };

      window.addEventListener('mousemove', onResizeMouseMove);
      window.addEventListener('mouseup', onResizeMouseUp);

      // Initial trigger
      populateTemplateDropdown('All Categories');
      tplSelect.dispatchEvent(new Event('change'));
    }

    rmsBtn.addEventListener('click', () => {
      const orderNumber = extractOrderNumber();
      if (!orderNumber) {
        showToast('Could not find Order Number on this ticket.', 'error');
        return;
      }
      const rmsUrl = `https://food-rms.breadfast.com/orders/list?page=1&limit=10&sortBy=placedAt&sortOrder=desc&search=${encodeURIComponent(orderNumber)}&searchBy=orderNumber&bf_autoclick=1`;
      window.open(rmsUrl, '_blank', 'noopener,noreferrer');
    });

    // =========================================================================
    // SMS Dashboard Button
    // =========================================================================
    smsBtn.addEventListener('click', () => {
      const customerId = extractCustomerId();
      const orderNo = extractOrderNumber();
      let cleanOrderId = '';
      if (orderNo) {
        cleanOrderId = orderNo.includes('-') ? (orderNo.split('-')[1] || orderNo) : orderNo;
        cleanOrderId = cleanOrderId.replace(/^[^\d]+/, '').trim();
      }

      const smsUrl = `https://www.breadfast.com/dashboard/sms/create?orderId=${encodeURIComponent(cleanOrderId)}&&customerId=${encodeURIComponent(customerId || '')}`;

      if (customerId && cleanOrderId) {
        showToast(`Opening SMS Dashboard (Order #${cleanOrderId} - Customer #${customerId})...`, 'info');
      } else if (customerId) {
        showToast(`Opening SMS Dashboard (Customer #${customerId})...`, 'info');
      } else if (cleanOrderId) {
        showToast(`Customer ID not found, opening SMS with Order #${cleanOrderId}...`, 'info');
      } else {
        showToast('Opening SMS Dashboard...', 'info');
      }

      window.open(smsUrl, '_blank', 'noopener,noreferrer');
    });

    // =========================================================================
    // Tree Button & Cascading Flyout Menu (Ticket Actions - Calm Blue)
    // =========================================================================
    const treeBtn = createBtn('btn-tree-ticket', 'Tree', '#2563eb');
    treeBtn.style.width = '100%';
    treeBtn.style.display = 'flex';
    treeBtn.style.justifyContent = 'center';
    treeBtn.style.alignItems = 'center';

    const treeWrapper = document.createElement('div');
    treeWrapper.id = 'bf-tree-wrapper';
    treeWrapper.style.position = 'relative';
    treeWrapper.style.width = '100%';
    treeWrapper.appendChild(treeBtn);

    // Tree structure: Tree -> Complaints -> Categories -> Issues
    const treeData = [
      {
        label: 'Complaints',
        children: [
          {
            label: 'Food safety',
            children: [
              { label: 'Foreign objects' },
              { label: 'Rotten' },
              { label: 'Spoiled' },
              { label: 'Insect' },
              { label: 'Expired Food Product' },
              { label: 'Allergic reaction' },
              { label: 'Food borne illness' },
              { label: 'Poisoning' }
            ]
          },
          {
            label: 'Product Quality',
            children: [
              { label: 'Oily' },
              { label: 'Discoloration' },
              { label: 'Dry' },
              { label: 'Soft' },
              { label: 'Used before' },
              { label: 'Eggy/Fishy smell' },
              { label: 'Chemical smell' },
              { label: 'Battery life' },
              { label: 'Atomizer not working' },
              { label: 'Filling' },
              { label: 'Freshness' },
              { label: 'Size' },
              { label: 'Topping' },
              { label: 'Over ripe' },
              { label: 'Under ripe' },
              { label: 'Doughy' },
              { label: 'Poor-quality ingredients' },
              { label: 'Burnt' },
              { label: 'Over cooked' },
              { label: 'Under cooked' },
              { label: 'Bitter Taste' },
              { label: 'Tasteless' },
              { label: 'Rancid Taste' },
              { label: 'Salty Taste' },
              { label: 'Soggy Taste' },
              { label: 'Sweet Taste' },
              { label: 'Watery / Weak Taste' }
            ]
          },
          {
            label: 'Product Data Accuracy',
            children: [
              { label: 'Incomplete / incorrect product data' },
              { label: "Item / Order doesn't match picture / description" },
              { label: 'Missing label' },
              { label: 'Weight' },
              { label: 'Warranty card not included' },
              { label: 'Fake product' }
            ]
          },
          {
            label: 'Service Quality',
            children: [
              { label: 'Cancelled without my permission' }
            ]
          },
          {
            label: 'Packaging Quality & Condition',
            children: [
              { label: 'Damaged packaging' },
              { label: 'Dirty packaging' },
              { label: 'Smashed' },
              { label: 'Unsealed' },
              { label: 'Extra items' },
              { label: 'Irrelevant item in the same bag' },
              { label: 'Missing bag' },
              { label: 'Side Item Missing' },
              { label: 'Missing cutlery' },
              { label: 'Missing gift' },
              { label: 'Missing items' },
              { label: 'Missing add-on' },
              { label: 'Wrong bag' },
              { label: 'Wrong item' },
              { label: 'Wrong add-on' },
              { label: 'Wrong side item' },
              { label: '# of product per pack less than promised' },
              { label: 'Missing gift bag' },
              { label: 'Gift Package' }
            ]
          },
          {
            label: 'Customer Support Experience',
            children: [
              { label: 'Chat' },
              { label: 'Email' },
              { label: 'Social Media' },
              { label: 'Outbound' },
              { label: 'Retention' }
            ]
          },
          {
            label: 'Delivery Experience',
            children: [
              { label: 'Delivered Cold - Wrong Temperatur' },
              { label: 'Delivered Hot -Wrong Temperatur' },
              { label: 'Melted' },
              { label: 'Not following delivery instructions' },
              { label: 'Completed but not delivered' },
              { label: 'Wrong order' },
              { label: 'No change' },
              { label: 'Wrong collection' },
              { label: 'Unnecessary contact' },
              { label: 'Spilled' },
              { label: "DA didn't call me" }
            ]
          },
          {
            label: 'Services / Order Timing',
            children: [
              { label: 'Late' },
              { label: 'Early' }
            ]
          },
          {
            label: 'Safety Incident',
            children: [
              { label: 'Harassment' },
              { label: 'Theft' }
            ]
          },
          {
            label: 'Staff Conduct & Appearance',
            children: [
              { label: 'Dress code' },
              { label: 'Hygiene' },
              { label: 'Smoking' },
              { label: 'Refused to come to door / asked customer to meet outside' },
              { label: 'Inappropriate attitude' }
            ]
          },
          {
            label: 'Refund Experience',
            children: [
              { label: 'Refund promised but delayed' },
              { label: 'Wrong refund amount' },
              { label: 'Wrong refund method' }
            ]
          },
          {
            label: 'Promotions & Rewards Issues',
            children: [
              { label: 'Points not added' },
              { label: 'Coupon used in undelivered order - cannot be used again' },
              { label: 'User cannot redeem points' },
              { label: 'User cannot apply coupon' },
              { label: 'Not eligible to use the coupon' },
              { label: 'Misleading details' },
              { label: 'Instant discount coupon not reflected' },
              { label: 'Cashback coupon not relfected' },
              { label: "Referral didn't receive cashback" },
              { label: "Referee didn't receive discount" }
            ]
          }
        ]
      },
      {
        label: 'Feedback',
        children: [
          {
            label: 'Positive',
            children: [
              { label: 'Products Stock' },
              { label: 'Products Variety' },
              { label: 'Packaging Material' },
              { label: 'Delivery coverage' },
              { label: 'Delivery time' },
              { label: 'Delivery Associate' },
              { label: 'App usability/functionality' },
              { label: 'App Product Description' },
              { label: 'CX agent' },
              { label: 'Products Quality' },
              { label: 'Products Pricing' },
              { label: 'Delivery Fees' },
              { label: 'Promotions' },
              { label: 'Order Fulfillment' },
              { label: 'Bills Payment' },
              { label: 'Undefined/General' },
              { label: 'Other' }
            ]
          },
          {
            label: 'Negative',
            children: [
              { label: 'Products Stock' },
              { label: 'Products Variety' },
              { label: 'Packaging Material' },
              { label: 'Delivery coverage' },
              { label: 'Delivery time' },
              { label: 'Delivery Associate' },
              { label: 'App usability/functionality' },
              { label: 'App Product Description' },
              { label: 'CX agent' },
              {
                label: 'Products Quality',
                children: [
                  { label: 'Quality' },
                  { label: 'Damaged' },
                  { label: 'Taste' },
                  { label: 'Foreign object' },
                  { label: 'Expiry date preference' },
                  { label: 'Size' }
                ]
              },
              { label: 'Products Pricing' },
              { label: 'Delivery Fees' },
              { label: 'Promotions' },
              { label: 'Order Fulfillment' },
              { label: 'Bills Payment' },
              { label: 'Undefined/General' },
              { label: 'Boycott' },
              { label: 'Other' }
            ]
          },
          {
            label: 'Neutral',
            children: [
              { label: 'Suggestion' },
              { label: 'Other' }
            ]
          },
          {
            label: 'Unsealed bag',
            children: [
              { label: 'Positive' },
              { label: 'Negative' }
            ]
          },
          { label: 'BCard' }
        ]
      }
    ];

    // Add sleek dark scrollbar styles once to head
    if (!document.getElementById('bf-tree-menu-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'bf-tree-menu-styles';
      styleEl.textContent = `
        .bf-tree-menu::-webkit-scrollbar, .bf-sheets-menu::-webkit-scrollbar {
          width: 5px;
        }
        .bf-tree-menu::-webkit-scrollbar-track, .bf-sheets-menu::-webkit-scrollbar-track {
          background: transparent;
        }
        .bf-tree-menu::-webkit-scrollbar-thumb, .bf-sheets-menu::-webkit-scrollbar-thumb {
          background: #475569;
          border-radius: 4px;
        }
        .bf-tree-menu::-webkit-scrollbar-thumb:hover, .bf-sheets-menu::-webkit-scrollbar-thumb:hover {
          background: #64748b;
        }
      `;
      document.head.appendChild(styleEl);
    }

    let rootMenu = null;
    const activeSubmenusByDepth = {};

    const closeAllTreeMenus = () => {
      if (rootMenu) rootMenu.style.display = 'none';
      const allSubmenus = treeWrapper.querySelectorAll('.bf-tree-menu:not(.bf-tree-menu-root)');
      allSubmenus.forEach(sm => sm.style.display = 'none');
      Object.keys(activeSubmenusByDepth).forEach(k => delete activeSubmenusByDepth[k]);
      treeWrapper.querySelectorAll('.bf-tree-item').forEach(el => {
        el.style.backgroundColor = 'transparent';
      });
    };

    const closeSubmenusFromDepth = (depth) => {
      Object.keys(activeSubmenusByDepth).forEach(d => {
        if (parseInt(d, 10) >= depth) {
          if (activeSubmenusByDepth[d]) {
            activeSubmenusByDepth[d].style.display = 'none';
          }
          delete activeSubmenusByDepth[d];
        }
      });
      treeWrapper.querySelectorAll('.bf-tree-item').forEach(el => {
        if (el._childMenu && el._childMenu.style.display === 'none') {
          el.style.backgroundColor = 'transparent';
        }
      });
    };

    const buildSubmenu = (items, isRoot = false, path = [], depth = 0) => {
      const menu = document.createElement('div');
      menu.className = 'bf-tree-menu' + (isRoot ? ' bf-tree-menu-root' : '');
      menu.style.backgroundColor = '#1e293b';
      menu.style.color = '#f8fafc';
      menu.style.borderRadius = '8px';
      menu.style.padding = '6px';
      menu.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.3)';
      menu.style.border = '1px solid rgba(255, 255, 255, 0.15)';
      menu.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      menu.style.fontSize = '12px';
      menu.style.userSelect = 'none';
      menu.style.display = 'none';
      menu.style.minWidth = isRoot ? '160px' : '230px';
      menu.style.maxWidth = isRoot ? '200px' : '270px';

      // Clean single-column vertical list with scrollbar for submenus
      if (!isRoot) {
        menu.style.position = 'fixed';
        menu.style.maxHeight = '380px';
        menu.style.overflowY = 'auto';
        menu.style.overflowX = 'hidden';
        menu.style.scrollbarWidth = 'thin';
        menu.style.scrollbarColor = '#475569 transparent';
        menu.style.zIndex = (1000000 + depth * 10).toString();
      } else {
        menu.style.position = 'absolute';
        menu.style.zIndex = '1000000';
        menu.style.bottom = '0';
        if (currentSide === 'right') {
          menu.style.right = 'calc(100% + 8px)';
          menu.style.left = 'auto';
        } else {
          menu.style.left = 'calc(100% + 8px)';
          menu.style.right = 'auto';
        }
      }

      // Single-column vertical flex container
      const listContainer = document.createElement('div');
      listContainer.className = 'bf-tree-list-container';
      listContainer.style.display = 'flex';
      listContainer.style.flexDirection = 'column';
      listContainer.style.gap = '2px';
      menu.appendChild(listContainer);

      items.forEach(item => {
        if (item.type === 'divider') {
          const div = document.createElement('div');
          div.style.height = '1px';
          div.style.margin = '4px 2px';
          div.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
          listContainer.appendChild(div);
          return;
        }

        const itemEl = document.createElement('div');
        itemEl.className = 'bf-tree-item';
        itemEl.style.position = 'relative';
        itemEl.style.display = 'flex';
        itemEl.style.alignItems = 'center';
        itemEl.style.justifyContent = 'space-between';
        itemEl.style.padding = '6px 10px';
        itemEl.style.borderRadius = '5px';
        itemEl.style.cursor = 'pointer';
        itemEl.style.transition = 'background-color 0.15s ease, color 0.15s ease';
        itemEl.style.whiteSpace = 'nowrap';
        itemEl.style.gap = '8px';

        const textSpan = document.createElement('span');
        textSpan.textContent = item.label;
        textSpan.style.fontWeight = '500';
        textSpan.style.fontSize = '12px';
        textSpan.style.overflow = 'hidden';
        textSpan.style.textOverflow = 'ellipsis';
        itemEl.appendChild(textSpan);

        if (item.children && item.children.length > 0) {
          const arrow = document.createElement('span');
          arrow.className = 'bf-tree-arrow';
          arrow.textContent = currentSide === 'right' ? '◂' : '▸';
          arrow.style.fontSize = '11px';
          arrow.style.opacity = '0.8';
          itemEl.appendChild(arrow);

          const currentPath = [...path, item.label];
          const childMenu = buildSubmenu(item.children, false, currentPath, depth + 1);
          itemEl._childMenu = childMenu;
          treeWrapper.appendChild(childMenu); // Append to top-level treeWrapper so it's NEVER clipped!

          const positionAndShowChildMenu = () => {
            closeSubmenusFromDepth(depth + 1);
            activeSubmenusByDepth[depth + 1] = childMenu;

            const rect = itemEl.getBoundingClientRect();
            childMenu.style.display = 'block';

            // Horizontal positioning
            const menuWidth = childMenu.offsetWidth || 250;
            if (currentSide === 'right') {
              let rightPos = window.innerWidth - rect.left + 4;
              if (rect.left - menuWidth < 10) {
                // If overflows left screen edge, flip to right
                childMenu.style.left = `${rect.right + 4}px`;
                childMenu.style.right = 'auto';
              } else {
                childMenu.style.right = `${rightPos}px`;
                childMenu.style.left = 'auto';
              }
            } else {
              let leftPos = rect.right + 4;
              if (leftPos + menuWidth > window.innerWidth - 10) {
                // If overflows right screen edge, flip to left
                childMenu.style.right = `${window.innerWidth - rect.left + 4}px`;
                childMenu.style.left = 'auto';
              } else {
                childMenu.style.left = `${leftPos}px`;
                childMenu.style.right = 'auto';
              }
            }

            // Vertical positioning
            const menuHeight = Math.min(childMenu.offsetHeight || 380, 380);
            let topPos = rect.top - 4;
            if (topPos + menuHeight > window.innerHeight - 10) {
              topPos = Math.max(10, window.innerHeight - menuHeight - 10);
            }
            if (topPos < 10) topPos = 10;
            childMenu.style.top = `${topPos}px`;
          };

          // Hover ONLY highlights the item; it NEVER opens or closes menus automatically
          itemEl.addEventListener('mouseenter', () => {
            if (childMenu.style.display !== 'block') {
              itemEl.style.backgroundColor = '#334155';
            }
          });

          itemEl.addEventListener('mouseleave', () => {
            if (childMenu.style.display !== 'block') {
              itemEl.style.backgroundColor = 'transparent';
            }
          });

          // Click opens and locks the submenu open until another click occurs
          itemEl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (childMenu.style.display === 'block') {
              closeSubmenusFromDepth(depth + 1);
              itemEl.style.backgroundColor = 'transparent';
            } else {
              listContainer.querySelectorAll('.bf-tree-item').forEach(sib => {
                if (sib !== itemEl && (!sib._childMenu || sib._childMenu.style.display === 'none')) {
                  sib.style.backgroundColor = 'transparent';
                }
              });
              itemEl.style.backgroundColor = '#2563eb';
              positionAndShowChildMenu();
            }
          });
        } else {
          // Leaf item
          itemEl.addEventListener('mouseenter', () => {
            itemEl.style.backgroundColor = '#334155';
          });
          itemEl.addEventListener('mouseleave', () => {
            itemEl.style.backgroundColor = 'transparent';
          });

          itemEl.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllTreeMenus();

            const currentPath = [...path, item.label];
            const treeType = currentPath[0] || 'Complaints';
            const category = currentPath[1] || '';
            const detail = currentPath[2] || item.label;
            const subDetail = currentPath.length > 3 ? currentPath[3] : '';

            const pathLabel = currentPath.slice(1).join(' > ');
            showToast(`[${treeType}] Selected: ${pathLabel}`, 'info');

            if (window.location.pathname.startsWith('/a/tickets/new')) {
              applyTreeToForm(treeType, category, detail, subDetail);
            } else {
              openTicketPage(treeBtn, 'Tree', {
                bf_tree_type: treeType,
                bf_category: category,
                bf_detail: detail,
                bf_sub_detail: subDetail,
                bf_tree_choice: subDetail || detail
              });
            }
          });
        }

        listContainer.appendChild(itemEl);
      });

      return menu;
    };

    rootMenu = buildSubmenu(treeData, true, []);
    treeWrapper.appendChild(rootMenu);

    treeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof closeAllSheetsMenus === 'function') {
        closeAllSheetsMenus();
      }
      const isOpen = rootMenu.style.display === 'block';
      if (isOpen) {
        closeAllTreeMenus();
      } else {
        closeAllTreeMenus();
        rootMenu.style.display = 'block';
      }
    });

    document.addEventListener('click', (e) => {
      if (!treeWrapper.contains(e.target)) {
        closeAllTreeMenus();
      }
    });

    updateTreeMenuPosition = (side) => {
      if (!rootMenu) return;
      if (side === 'right') {
        rootMenu.style.right = 'calc(100% + 8px)';
        rootMenu.style.left = 'auto';
      } else {
        rootMenu.style.left = 'calc(100% + 8px)';
        rootMenu.style.right = 'auto';
      }
      const arrows = treeWrapper.querySelectorAll('.bf-tree-arrow');
      arrows.forEach(ar => {
        ar.textContent = side === 'right' ? '◂' : '▸';
      });
      closeAllTreeMenus();
    };

    updateTreeMenuPosition(currentSide);

    // =========================================================================
    // Sheets Button & Cascading Flyout Menu (KB & Shifts)
    // =========================================================================
    const sheetsBtn = createBtn('btn-sheets-menu', 'Sheets', '#7c3aed');
    sheetsBtn.title = 'Google Sheets Shortcuts (KB & Shifts)';
    sheetsBtn.style.width = '100%';
    sheetsBtn.style.display = 'flex';
    sheetsBtn.style.justifyContent = 'center';
    sheetsBtn.style.alignItems = 'center';

    const sheetsWrapper = document.createElement('div');
    sheetsWrapper.id = 'bf-sheets-wrapper';
    sheetsWrapper.style.position = 'relative';
    sheetsWrapper.style.width = '100%';
    sheetsWrapper.appendChild(sheetsBtn);

    // Google Sheets URLs dictionary (Populate with target sheet links)
    const SHEETS_URLS = {
      kb_rating: '',
      kb_retention: '',
      kb_rider: '',
      kb_chat: '',
      shifts_swap_shift: '',
      shifts_swap_off: '',
      shifts_vacation: '',
      shifts_off_queue: '',
      shifts_late: ''
    };

    const sheetsData = [
      {
        label: 'KB',
        children: [
          { label: 'Rating', key: 'kb_rating' },
          { label: 'Retention', key: 'kb_retention' },
          { label: 'Rider', key: 'kb_rider' },
          { label: 'Chat', key: 'kb_chat' }
        ]
      },
      {
        label: 'Shifts',
        children: [
          { label: 'Swap shift', key: 'shifts_swap_shift' },
          { label: 'Swap off', key: 'shifts_swap_off' },
          { label: 'Vacation', key: 'shifts_vacation' },
          { label: 'Off queue', key: 'shifts_off_queue' },
          { label: 'Late', key: 'shifts_late' }
        ]
      }
    ];

    let rootSheetsMenu = null;
    const activeSheetsSubmenusByDepth = {};

    const closeAllSheetsMenus = () => {
      if (rootSheetsMenu) rootSheetsMenu.style.display = 'none';
      const allSubmenus = sheetsWrapper.querySelectorAll('.bf-sheets-menu:not(.bf-sheets-menu-root)');
      allSubmenus.forEach(sm => sm.style.display = 'none');
      Object.keys(activeSheetsSubmenusByDepth).forEach(k => delete activeSheetsSubmenusByDepth[k]);
      sheetsWrapper.querySelectorAll('.bf-sheets-item').forEach(el => {
        el.style.backgroundColor = 'transparent';
      });
    };

    const closeSheetsSubmenusFromDepth = (depth) => {
      Object.keys(activeSheetsSubmenusByDepth).forEach(d => {
        if (parseInt(d, 10) >= depth) {
          if (activeSheetsSubmenusByDepth[d]) {
            activeSheetsSubmenusByDepth[d].style.display = 'none';
          }
          delete activeSheetsSubmenusByDepth[d];
        }
      });
      sheetsWrapper.querySelectorAll('.bf-sheets-item').forEach(el => {
        if (el._childMenu && el._childMenu.style.display === 'none') {
          el.style.backgroundColor = 'transparent';
        }
      });
    };

    const buildSheetsSubmenu = (items, isRoot = false, path = [], depth = 0) => {
      const menu = document.createElement('div');
      menu.className = 'bf-sheets-menu' + (isRoot ? ' bf-sheets-menu-root' : '');
      menu.style.backgroundColor = '#1e293b';
      menu.style.color = '#f8fafc';
      menu.style.borderRadius = '8px';
      menu.style.padding = '6px';
      menu.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.3)';
      menu.style.border = '1px solid rgba(255, 255, 255, 0.15)';
      menu.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      menu.style.fontSize = '12px';
      menu.style.userSelect = 'none';
      menu.style.display = 'none';
      menu.style.minWidth = isRoot ? '140px' : '170px';
      menu.style.maxWidth = isRoot ? '180px' : '220px';

      if (!isRoot) {
        menu.style.position = 'fixed';
        menu.style.maxHeight = '320px';
        menu.style.overflowY = 'auto';
        menu.style.overflowX = 'hidden';
        menu.style.scrollbarWidth = 'thin';
        menu.style.scrollbarColor = '#475569 transparent';
        menu.style.zIndex = (1000000 + depth * 10).toString();
      } else {
        menu.style.position = 'absolute';
        menu.style.zIndex = '1000000';
        menu.style.bottom = '0';
        if (currentSide === 'right') {
          menu.style.right = 'calc(100% + 8px)';
          menu.style.left = 'auto';
        } else {
          menu.style.left = 'calc(100% + 8px)';
          menu.style.right = 'auto';
        }
      }

      const listContainer = document.createElement('div');
      listContainer.className = 'bf-sheets-list-container';
      listContainer.style.display = 'flex';
      listContainer.style.flexDirection = 'column';
      listContainer.style.gap = '2px';
      menu.appendChild(listContainer);

      items.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'bf-sheets-item';
        itemEl.style.position = 'relative';
        itemEl.style.display = 'flex';
        itemEl.style.alignItems = 'center';
        itemEl.style.justifyContent = 'space-between';
        itemEl.style.padding = '6px 10px';
        itemEl.style.borderRadius = '5px';
        itemEl.style.cursor = 'pointer';
        itemEl.style.transition = 'background-color 0.15s ease, color 0.15s ease';
        itemEl.style.whiteSpace = 'nowrap';
        itemEl.style.gap = '8px';

        const textSpan = document.createElement('span');
        textSpan.textContent = item.label;
        textSpan.style.fontWeight = '500';
        textSpan.style.fontSize = '12px';
        textSpan.style.overflow = 'hidden';
        textSpan.style.textOverflow = 'ellipsis';
        itemEl.appendChild(textSpan);

        if (item.children && item.children.length > 0) {
          const arrow = document.createElement('span');
          arrow.className = 'bf-sheets-arrow';
          arrow.textContent = currentSide === 'right' ? '◂' : '▸';
          arrow.style.fontSize = '11px';
          arrow.style.opacity = '0.8';
          itemEl.appendChild(arrow);

          const currentPath = [...path, item.label];
          const childMenu = buildSheetsSubmenu(item.children, false, currentPath, depth + 1);
          itemEl._childMenu = childMenu;
          sheetsWrapper.appendChild(childMenu);

          const positionAndShowChildMenu = () => {
            closeSheetsSubmenusFromDepth(depth + 1);
            activeSheetsSubmenusByDepth[depth + 1] = childMenu;

            const rect = itemEl.getBoundingClientRect();
            childMenu.style.display = 'block';

            // Horizontal positioning
            const menuWidth = childMenu.offsetWidth || 170;
            if (currentSide === 'right') {
              let rightPos = window.innerWidth - rect.left + 4;
              if (rect.left - menuWidth < 10) {
                childMenu.style.left = `${rect.right + 4}px`;
                childMenu.style.right = 'auto';
              } else {
                childMenu.style.right = `${rightPos}px`;
                childMenu.style.left = 'auto';
              }
            } else {
              let leftPos = rect.right + 4;
              if (leftPos + menuWidth > window.innerWidth - 10) {
                childMenu.style.right = `${window.innerWidth - rect.left + 4}px`;
                childMenu.style.left = 'auto';
              } else {
                childMenu.style.left = `${leftPos}px`;
                childMenu.style.right = 'auto';
              }
            }

            // Vertical positioning
            const menuHeight = Math.min(childMenu.offsetHeight || 220, 220);
            let topPos = rect.top - 4;
            if (topPos + menuHeight > window.innerHeight - 10) {
              topPos = Math.max(10, window.innerHeight - menuHeight - 10);
            }
            if (topPos < 10) topPos = 10;
            childMenu.style.top = `${topPos}px`;
          };

          itemEl.addEventListener('mouseenter', () => {
            if (childMenu.style.display !== 'block') {
              itemEl.style.backgroundColor = '#334155';
            }
          });

          itemEl.addEventListener('mouseleave', () => {
            if (childMenu.style.display !== 'block') {
              itemEl.style.backgroundColor = 'transparent';
            }
          });

          itemEl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (childMenu.style.display === 'block') {
              closeSheetsSubmenusFromDepth(depth + 1);
              itemEl.style.backgroundColor = 'transparent';
            } else {
              listContainer.querySelectorAll('.bf-sheets-item').forEach(sib => {
                if (sib !== itemEl && (!sib._childMenu || sib._childMenu.style.display === 'none')) {
                  sib.style.backgroundColor = 'transparent';
                }
              });
              itemEl.style.backgroundColor = '#7c3aed';
              positionAndShowChildMenu();
            }
          });
        } else {
          // Leaf item
          itemEl.addEventListener('mouseenter', () => {
            itemEl.style.backgroundColor = '#334155';
          });
          itemEl.addEventListener('mouseleave', () => {
            itemEl.style.backgroundColor = 'transparent';
          });

          itemEl.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllSheetsMenus();

            const url = SHEETS_URLS[item.key];
            const category = path[0] || 'Sheets';
            if (url && typeof url === 'string' && url.trim().length > 0) {
              showToast(`Opening [${category}] ${item.label}...`, 'info');
              window.open(url.trim(), '_blank', 'noopener,noreferrer');
            } else {
              showToast(`[Sheets] "${item.label}" selected (Link will be added soon)`, 'info');
            }
          });
        }

        listContainer.appendChild(itemEl);
      });

      return menu;
    };

    rootSheetsMenu = buildSheetsSubmenu(sheetsData, true, []);
    sheetsWrapper.appendChild(rootSheetsMenu);

    sheetsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof closeAllTreeMenus === 'function') {
        closeAllTreeMenus();
      }
      const isOpen = rootSheetsMenu.style.display === 'block';
      if (isOpen) {
        closeAllSheetsMenus();
      } else {
        closeAllSheetsMenus();
        rootSheetsMenu.style.display = 'block';
      }
    });

    document.addEventListener('click', (e) => {
      if (!sheetsWrapper.contains(e.target)) {
        closeAllSheetsMenus();
      }
    });

    updateSheetsMenuPosition = (side) => {
      if (!rootSheetsMenu) return;
      if (side === 'right') {
        rootSheetsMenu.style.right = 'calc(100% + 8px)';
        rootSheetsMenu.style.left = 'auto';
      } else {
        rootSheetsMenu.style.left = 'calc(100% + 8px)';
        rootSheetsMenu.style.right = 'auto';
      }
      const arrows = sheetsWrapper.querySelectorAll('.bf-sheets-arrow');
      arrows.forEach(ar => {
        ar.textContent = side === 'right' ? '◂' : '▸';
      });
      closeAllSheetsMenus();
    };

    updateSheetsMenuPosition(currentSide);

    container.appendChild(headerRow);

    const createSectionDivider = () => {
      const div = document.createElement('div');
      div.className = 'bf-section-divider';
      div.style.height = '1px';
      div.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
      div.style.margin = '2px 0';
      return div;
    };

    // Section 1: Ticket Actions (Calm Blue)
    container.appendChild(seniorBtn);
    container.appendChild(createBtnEl);
    container.appendChild(treeWrapper);

    container.appendChild(createSectionDivider());

    // Section 2: Customer & Operations (Calm Teal: RMS -> SMS -> Chat)
    container.appendChild(rmsBtn);
    container.appendChild(smsBtn);
    container.appendChild(chatBtn);

    container.appendChild(createSectionDivider());

    // Section 3: Tools & Utilities (Calm Violet)
    container.appendChild(delayBtn);
    container.appendChild(calcBtn);
    container.appendChild(emailBtn);
    container.appendChild(sheetsWrapper);

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
    const bfTreeChoice = usp.get('bf_tree_choice');
    const bfCategory = usp.get('bf_category');
    const bfTreeType = usp.get('bf_tree_type') || (bfCategory && bfCategory.toLowerCase().includes('feedback') ? 'Feedback' : (bfTreeChoice || bfCategory ? 'Complaints' : null));
    const bfDetail = usp.get('bf_detail') || bfTreeChoice;
    const bfSubDetail = usp.get('bf_sub_detail');

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
              if (verifyRetries > 40) {
                clearInterval(verifyInterval);
                showToast('No search results found. Proceeding to next step...', 'error');
              }
            }, 150);
          }
          return true;
        }
        return false;
      };

      const start = performance.now();
      const MAX_WAIT = 15000;
      if (!fillContact()) {
        const interval = setInterval(() => {
          if (fillContact()) {
            clearInterval(interval);
          } else if (performance.now() - start > MAX_WAIT) {
            clearInterval(interval);
          }
        }, 100);
      }
    }

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
      let cat = bfCategory || '';
      if (cat.includes('>')) {
        cat = (cat.split('>').pop() || '').trim();
      }
      const det = bfDetail || bfTreeChoice || '';
      const subDet = bfSubDetail || '';

      if (cat || det || subDet) {
        return setTicketSubject(cat, det, subDet);
      }

      if (!bfOrderNumber) return true;
      const s = findSubjectInput();
      if (s && !s.disabled) {
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
      } catch (e) {
        return false;
      }
    };

    const runAutomations = () => {
      let runAttempts = 0;
      let treeAutomationDone = false;
      let allDone = false;
      let isSyncing = false;

      const syncState = async () => {
        if (isSyncing || allDone) return;
        isSyncing = true;

        try {
          const orderOk = assertOrderNumber();
          const buOk = await assertDropdown('Business unit', 'Food Aggregation', 6000);
          let delOk = true;
          const deliveryValToSet = bfDeliveryBy || 'Restaurant';
          if (deliveryValToSet) {
            await new Promise(r => setTimeout(r, 120));
            for (let rTry = 0; rTry < 3; rTry++) {
              if (rTry > 0) await new Promise(r => setTimeout(r, 200));
              delOk = await assertDropdown('Delivery By', deliveryValToSet, 6000);
              if (delOk) break;
            }
          }
          const subjOk = assertSubject();
          const descOk = assertDescription();

          let treeOk = true;
          // Handle Tree Automation if params exist
          if (bfTreeChoice || bfDetail || bfCategory || bfSubDetail) {
            if (!treeAutomationDone) {
              const typeToApply = bfTreeType || 'Complaints';
              let catToApply = bfCategory || '';
              if (catToApply.includes('>')) {
                catToApply = (catToApply.split('>').pop() || '').trim();
              }
              const detailToApply = bfDetail || bfTreeChoice || '';
              const subDetailToApply = bfSubDetail || '';

              const ok = await applyTreeToForm(typeToApply, catToApply, detailToApply, subDetailToApply);
              if (ok) {
                treeAutomationDone = true;
              } else {
                treeOk = false;
              }
            }
          }

          if (orderOk && buOk && delOk && subjOk && descOk && treeOk) {
            allDone = true;
          }
        } catch (e) {
          console.error('[BF Extension] Error in automation sync:', e);
        } finally {
          isSyncing = false;
        }
      };

      const checkAndSync = async () => {
        const formIsRendered = findSubjectInput();
        if (!formIsRendered) return;

        if (allDone || runAttempts > 30) {
          if (masterIv) clearInterval(masterIv);
          return;
        }
        runAttempts++;

        await syncState();
      };

      const masterIv = setInterval(checkAndSync, 150);
      checkAndSync();
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
    } catch (e) { }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', ensureButtons);
    } else {
      ensureButtons();
    }
  }

  // =========================================================================
  // Breadfast Admin Order Page Logic (Direct "Chat" Button next to Phone)
  // =========================================================================
  if (isBreadfastAdmin) {
    function injectOrderPageChatButton() {
      const editAddress = document.querySelector('#editAddress, .order_data_column');
      if (!editAddress) return;
      if (document.getElementById('bf-order-chat-link')) return;

      const pTags = Array.from(editAddress.querySelectorAll('p, div'));
      for (const p of pTags) {
        if (/Phone:?/i.test(p.textContent)) {
          const match = p.textContent.match(/Phone:?\s*([+\d\s\-()]{8,})/i);
          if (match) {
            let digits = match[1].replace(/[^\d]/g, '');
            if (digits.startsWith('0020')) digits = digits.substring(2);
            if (digits.startsWith('01') && digits.length === 11) digits = '2' + digits;
            if (digits) {
              const btn = document.createElement('a');
              btn.id = 'bf-order-chat-link';
              btn.href = `https://kairos.breadfast.com/app/accounts/1/search?q=${encodeURIComponent(digits)}`;
              btn.target = '_blank';
              btn.rel = 'noopener noreferrer';
              btn.textContent = ' 💬 Chat';
              btn.title = 'Open customer chat in Kairos';
              btn.style.cssText = 'display:inline-block; margin-left:8px; padding:2px 8px; background-color:#10b981; color:#fff; border-radius:4px; font-weight:bold; font-size:12px; text-decoration:none; vertical-align:middle; cursor:pointer;';
              p.appendChild(btn);
              break;
            }
          }
        }
      }
    }

    setInterval(injectOrderPageChatButton, 800);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectOrderPageChatButton);
    } else {
      injectOrderPageChatButton();
    }
  }

  // =========================================================================
  // =========================================================================
  // Breadfast Food RMS Automation: Auto-open Order Details from List
  // =========================================================================
  if (isFoodRms) {
    // If already on order details page (/orders/details/...), do nothing!
    if (window.location.pathname.includes('/orders/details/')) {
      return;
    }

    const usp = new URLSearchParams(window.location.search);
    const searchOrderNum = usp.get('search') || '';
    const isAutoclick = usp.has('bf_autoclick') || Boolean(searchOrderNum);

    if (isAutoclick) {
      let isNavigating = false;

      function goToDetails(orderId, triggerEl = null) {
        if (isNavigating) return;
        isNavigating = true;

        showToast(`Opening Order Details (#${orderId})...`, 'info');
        const targetUrl = `https://food-rms.breadfast.com/orders/details/${orderId}`;

        if (triggerEl) {
          ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
            try {
              triggerEl.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
            } catch (e) { }
          });
          try {
            if (typeof triggerEl.click === 'function') triggerEl.click();
          } catch (e) { }
        }

        // Direct navigation guarantees redirection even if synthetic click didn't trigger router
        window.location.href = targetUrl;
      }

      // DOM Scanner for Details link, data-row-key, ID cells, and buttons (CSP-compliant)
      function tryFindAndOpenDetails() {
        if (isNavigating) return true;

        // Check 1: Direct link pointing to /orders/details/<id>
        const detailsLinks = Array.from(document.querySelectorAll('a[href*="/orders/details/"]'));
        for (const a of detailsLinks) {
          const href = a.getAttribute('href') || a.href || '';
          const match = href.match(/\/orders\/details\/(\d+)/);
          if (match && match[1]) {
            goToDetails(match[1], a);
            return true;
          }
        }

        // Check 2: Ant Design or table row with data-row-key="<id>"
        const rowsWithKey = Array.from(document.querySelectorAll('[data-row-key]'));
        for (const r of rowsWithKey) {
          const key = (r.getAttribute('data-row-key') || '').trim();
          if (/^\d{4,10}$/.test(key)) {
            goToDetails(key, r);
            return true;
          }
        }

        // Check 3: Table cells containing the internal Order ID (e.g. 1073898)
        // Must be purely digits (4-10 digits), NOT the hyphenated order number (e.g. 2809-100214792)
        const cells = Array.from(document.querySelectorAll(
          'tbody td, .ant-table-tbody td, [role="row"] [role="cell"], .table td'
        ));
        for (const cell of cells) {
          const text = (cell.textContent || '').trim().replace(/^#/, '');
          if (/^\d{4,10}$/.test(text) && !text.includes('-') && text !== searchOrderNum) {
            const interactive = cell.querySelector('a, button, [role="button"]') || cell;
            goToDetails(text, interactive);
            return true;
          }
        }

        // Check 4: Any link or button inside a row containing the searched order number
        if (searchOrderNum) {
          const rows = Array.from(document.querySelectorAll('tbody tr, .ant-table-tbody > tr, [role="row"]'))
            .filter(r => !r.closest('thead'));
          for (const row of rows) {
            const rowText = (row.textContent || '');
            if (rowText.includes(searchOrderNum)) {
              // Match 4-10 digit numbers in this row that are not the order number
              const digitsMatches = rowText.match(/\b\d{4,10}\b/g) || [];
              for (const dm of digitsMatches) {
                if (dm !== searchOrderNum && !searchOrderNum.includes(dm)) {
                  const interactive = row.querySelector('a, button, [role="button"]') || row;
                  goToDetails(dm, interactive);
                  return true;
                }
              }
            }
          }
        }

        return false;
      }

      // Continuous polling and MutationObserver to catch row immediately
      let attempts = 0;
      const rmsIv = setInterval(() => {
        attempts++;
        if (tryFindAndOpenDetails() || attempts > 150) {
          clearInterval(rmsIv);
        }
      }, 100);

      const observer = new MutationObserver(() => {
        if (tryFindAndOpenDetails()) {
          observer.disconnect();
          clearInterval(rmsIv);
        }
      });

      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
          }
        });
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => tryFindAndOpenDetails());
      } else {
        tryFindAndOpenDetails();
      }
    }
  }
})();
