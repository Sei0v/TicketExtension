(function () {
  'use strict';

  const isFreshdesk = window.location.host.includes('freshdesk');
  const isBreadfastAdmin = window.location.host.includes('breadfast.com') &&
    (window.location.pathname.includes('post.php') || window.location.pathname.includes('wp-admin'));
  const isFoodRms = window.location.host.includes('food-rms') ||
    (window.location.host.includes('rms') && window.location.host.includes('breadfast'));

  const isKairos = window.location.host.includes('kairos');

  if (!isFreshdesk && !isBreadfastAdmin && !isFoodRms && !isKairos) {
    return;
  }
  console.log('[Kairos Tool] Script active on host:', window.location.host);

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

  // Agent's default Team (configurable from tool Settings, used for Complaints tickets)
  const getDefaultTeam = () => {
    try {
      const saved = (localStorage.getItem('bf_default_team') || '').trim();
      if (saved) return saved;
    } catch (e) {}
    return 'cx rating restaurant';
  };

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

  const getDropdownFollowing = (referenceTrigger) => {
    if (!referenceTrigger) return null;
    const root = referenceTrigger.closest('#ticket-properties, .ticket-properties, .sidebar-content, form, body') || document.body;
    const allTriggers = Array.from(root.querySelectorAll('.ember-power-select-trigger'));
    const idx = allTriggers.indexOf(referenceTrigger);
    if (idx !== -1 && idx + 1 < allTriggers.length) {
      return allTriggers[idx + 1];
    }
    return null;
  };

  const isTriggerDisabled = (tr) => {
    if (!tr) return true;
    if (tr.disabled || tr.hasAttribute('disabled')) return true;
    if (tr.getAttribute('aria-disabled') === 'true') return true;
    if (tr.classList.contains('ember-power-select-trigger--disabled')) return true;
    if (tr.classList.contains('disabled')) return true;
    const parent = tr.closest('.input, .__ui-form__select-field, .nested-fields, .nested-sub-fields, .nested-level-2-group, .nested-filter, [data-test-field], .form-group, .ember-view');
    if (parent && (parent.classList.contains('disabled') || parent.classList.contains('is-loading') || parent.classList.contains('loading') || parent.getAttribute('aria-disabled') === 'true')) {
      return true;
    }
    return false;
  };

  const kairosNorm = (s) => (s || '').trim().toLowerCase()
    .replace(/resturant/g, 'restaurant')
    .replace(/\s+/g, ' ');

  // Plural-insensitive compare: "Complaint" == "Complaints", "Request" == "Requests"
  const kairosTextMatch = (actual, expected) => {
    const a = kairosNorm(actual);
    const e = kairosNorm(expected);
    if (!a || !e) return false;
    if (a === e) return true;
    const strip = (s) => s.replace(/s$/, '');
    if (strip(a) === strip(e)) return true;
    const aClean = a.replace(/[^a-z0-9]/g, '');
    const eClean = e.replace(/[^a-z0-9]/g, '');
    if (aClean === eClean) return true;
    if (aClean.replace(/s$/, '') === eClean.replace(/s$/, '')) return true;
    return false;
  };

  // Kairos data glitch: some options render the value TWICE
  // ("Services/Order Timing Services/Order Timing"). Accept actual == expected+expected.
  const kairosDoubledMatch = (actual, expected) => {
    const a = kairosNorm(actual);
    const e = kairosNorm(expected);
    if (!a || !e) return false;
    if (a === e + ' ' + e || a === e + '/' + e || a === e + ' / ' + e || a === e + '-' + e || a === e + ' - ' + e) return true;
    const aClean = a.replace(/[^a-z0-9]/g, '');
    const eClean = e.replace(/[^a-z0-9]/g, '');
    if (aClean && eClean && aClean === eClean + eClean) return true;
    return false;
  };

  const getKairosTriggerText = (btn) => {
    if (!btn) return '';
    const span = btn.querySelector('span.min-w-0.truncate.text-start, span.truncate');
    if (span) return (span.textContent || '').trim();
    return (btn.textContent || '').trim();
  };

  // Modal root: compose-form testid when present, else anchor on the "(+phone" To chip.
  // Used to prefer MODAL fields over the background ticket's sidepanel fields.
  const findModalRoot = () => {
    const form = document.querySelector('[data-testid="compose-form"]');
    if (form) return form;
    try {
      const chips = Array.from(document.querySelectorAll('span, div, p')).filter(el => {
        if (el.closest('#bf-custom-ticket-buttons, #bf-continue-tree-btn')) return false;
        return /\(\+\d[\d\s\-()]{6,}\)/.test(el.textContent || '');
      });
      if (!chips.length) return null;
      chips.sort((a, b) => (a.outerHTML.length - b.outerHTML.length));
      const chip = chips[0];
      let p = chip.parentElement;
      for (let d = 0; d < 16 && p && p !== document.body; d++) {
        const txt = (p.textContent || '').toLowerCase();
        if ((txt.includes('via') || txt.includes('subject')) && txt.includes('business unit')) return p;
        p = p.parentElement;
      }
    } catch (e) {}
    return null;
  };

  const getTreeCascadeButtons = () => {
    const pick = (tc) => {
      if (!tc) return [];
      // Direct combobox buttons inside the cascade (level1, level2, level3...)
      // Main value buttons always show text (placeholder or value); icon-only
      // buttons (clear ×, chevrons) are excluded so indices never shift after
      // a selection renders its clear button.
      const btns = Array.from(tc.querySelectorAll('.group\\/combobox button, div.relative button'));
      const mains = btns.filter(b => (getKairosTriggerText(b) || '').trim().length > 0);
      const visible = (list) => list.filter(b => b.offsetParent !== null || b.getBoundingClientRect().width > 0);
      const visMains = visible(mains);
      if (visMains.length) return visMains;
      if (mains.length) return mains;
      const visAll = visible(btns);
      return visAll.length ? visAll : btns;
    };
    // Prefer the compose-modal cascade when a New Conversation modal is open
    const modal = findModalRoot();
    if (modal) {
      const mb = pick(modal.querySelector('[data-testid="tree-cascade"]'));
      if (mb.length) return mb;
    }
    return pick(document.querySelector('[data-testid="tree-cascade"]'));
  };

  const findKairosTriggerByLabel = (labelText) => {
    const want = kairosNorm(labelText);
    // Prefer the compose modal when open (New Conversation), else whole document
    const modal = findModalRoot();
    const roots = modal ? [modal, document] : [document];
    for (const root of roots) {
      const spans = Array.from(root.querySelectorAll('span, label'));
      for (const sp of spans) {
        // exact label match only (avoid matching option spans inside UL)
        if (sp.closest('ul[role="listbox"], li[role="option"]')) continue;
        const t = kairosNorm(sp.textContent);
        // label spans are short ("Type", "Business unit") — options are also short so require label styling parent
        if (t !== want) continue;
        // walk up to find the field container, then the combobox button
        let p = sp.parentElement;
        for (let d = 0; d < 5 && p && p !== document.body; d++) {
          if (root !== document && !root.contains(p)) break;
          const btn = p.querySelector(':scope .group\\/combobox button, :scope button');
          if (btn && getKairosTriggerText(btn)) {
            // make sure the button belongs to this label (button follows label in DOM order)
            if (sp.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING) return btn;
          }
          // also check sibling containers
          const sib = p.nextElementSibling;
          if (sib) {
            const sb = sib.querySelector('button') || (sib.tagName === 'BUTTON' ? sib : null);
            if (sb) return sb;
          }
          p = p.parentElement;
        }
      }
    }
    return null;
  };

  const findOptionInDOM = (optionText) => {
    if (!optionText) return null;
    // --- Kairos: li[role="option"] / div[role="option"] ---
    const lis = Array.from(document.querySelectorAll('li[role="option"], div[role="option"]'));
    for (const li of lis) {
      // skip options inside a display:none dropdown? No — keep them, dropdown opens on click.
      // But prefer visible dropdowns first.
      const txt = (li.textContent || '').trim();
      if (kairosTextMatch(txt, optionText)) {
        const dropdown = li.closest('div.absolute');
        const visible = dropdown ? dropdown.style.display !== 'none' : true;
        if (visible) return li;
      }
    }
    for (const li of lis) {
      if (kairosTextMatch((li.textContent || '').trim(), optionText)) return li;
    }
    // --- Freshdesk Ember fallback ---
    const emberOpts = Array.from(document.querySelectorAll('.ember-power-select-option, .ember-power-select-options li, [role="option"]'));
    for (const o of emberOpts) {
      if (kairosTextMatch((o.textContent || '').trim(), optionText)) return o;
    }
    // --- generic text fallback for Kairos ULs ---
    const uls = Array.from(document.querySelectorAll('ul[role="listbox"] li'));
    for (const li of uls) {
      if (kairosTextMatch((li.textContent || '').trim(), optionText)) return li;
    }
    // --- LAST RESORT: Kairos doubled-value glitch ("Services/Order Timing Services/Order Timing")
    // Exact match always wins (passes above); only accept the doubled form if nothing exact matched.
    const all = lis.concat(Array.from(document.querySelectorAll('ul[role="listbox"] li')));
    for (const li of all) {
      const txt = (li.textContent || '').trim();
      if (!kairosTextMatch(txt, optionText) && kairosDoubledMatch(txt, optionText)) {
        const dropdown = li.closest('div.absolute');
        const visible = dropdown ? dropdown.style.display !== 'none' : true;
        if (visible) {
          console.log(`[BF Kairos] Matched doubled option "${txt}" for "${optionText}".`);
          return li;
        }
      }
    }
    for (const li of all) {
      if (kairosDoubledMatch((li.textContent || '').trim(), optionText)) return li;
    }
    return null;
  };

  const findDropdownTrigger = (fieldName) => {
    // ===== KAIROS (BUTTON + UL combobox) — must come FIRST =====
    if (isKairos) {
      const knorm = (fieldName || '').toLowerCase().trim();

      // Type
      if (knorm === 'type' || knorm === 'ticket_type' || knorm === 'ticket type') {
        return findKairosTriggerByLabel('Type');
      }
      // Business unit
      if (knorm.includes('business unit') || knorm.includes('business_unit') || knorm === 'bu') {
        return findKairosTriggerByLabel('Business unit');
      }
      // Team (compose modal)
      if (knorm === 'team') {
        return findKairosTriggerByLabel('Team');
      }
      // Tree cascade levels: index-based (robust against label changes between Complaint/Feedback trees)
      const tcBtns = getTreeCascadeButtons();
      // Feedback type / level 1
      if (knorm === 'feedback type' || knorm === 'feedback_type' || knorm === 'food aggregation complaint' || knorm === 'food aggregation' ||
          knorm === 'complaint category' || knorm === 'feedback' || knorm === 'feedback category' || knorm === 'internal request type' ||
          knorm === 'category' || ((knorm.includes('feedback') || knorm.includes('complaint') || knorm.includes('internal')) && knorm.includes('type')) ||
          (tcBtns.length && (knorm.includes('category') || knorm.includes('cat')))) {
        if (tcBtns.length >= 1) return tcBtns[0];
        return findKairosTriggerByLabel('Feedback type') || findKairosTriggerByLabel('Type');
      }
      // Sub-category / level 2
      if (knorm.includes('sub-category') || knorm.includes('sub_category') || knorm.includes('subcategory') ||
          knorm === 'complaint details' || knorm === 'complaint detail' || knorm === 'feedback details' ||
          knorm === 'internal request' || knorm === 'detail' || knorm === 'details' || knorm === 'complaint sub-category') {
        if (tcBtns.length >= 2) return tcBtns[1];
        // label-based fallback: find "Sub-category" label then its button
        const lbls = Array.from(document.querySelectorAll('label'));
        for (const l of lbls) {
          if (kairosNorm(l.textContent) === 'sub-category') {
            const box = l.parentElement;
            if (box) {
              const b = box.querySelector('button') || box.nextElementSibling?.querySelector?.('button');
              if (b) return b;
            }
            let sib = l.nextElementSibling;
            while (sib) {
              if (sib.tagName === 'BUTTON') return sib;
              const b = sib.querySelector?.('button');
              if (b) return b;
              sib = sib.nextElementSibling;
            }
          }
        }
        if (tcBtns.length >= 1) {
          console.log('[BF Kairos] L2 not rendered yet (only', tcBtns.length, 'cascade button) — waiting, NOT touching L1.');
        }
        return null;
      }
      // Detail / level 3
      if (knorm === 'detail' || knorm.startsWith('detail ') || knorm.includes('level-3') || knorm.includes('level_3') || knorm.includes('quality')) {
        if (tcBtns.length >= 3) return tcBtns[2];
        if (tcBtns.length >= 2) return tcBtns[tcBtns.length - 1];
        return null;
      }
      // Generic Kairos label fallback
      const byLabel = findKairosTriggerByLabel(fieldName);
      if (byLabel) return byLabel;
    }

    const norm = (fieldName || '').toLowerCase().trim();

    // Helper to extract trigger from an element or its descendants/siblings
    const getTriggerFrom = (el) => {
      if (!el) return null;
      if (el.classList.contains('ember-power-select-trigger')) return el;
      const child = el.querySelector('.ember-power-select-trigger');
      if (child) return child;
      if (el.nextElementSibling) {
        if (el.nextElementSibling.classList.contains('ember-power-select-trigger')) return el.nextElementSibling;
        const sibChild = el.nextElementSibling.querySelector('.ember-power-select-trigger');
        if (sibChild) return sibChild;
      }
      if (el.parentElement) {
        if (el.parentElement.classList.contains('ember-power-select-trigger')) return el.parentElement;
        const sibling = el.parentElement.querySelector('.ember-power-select-trigger');
        if (sibling) return sibling;
        const container = el.closest('.input, .form-group, .field, [data-test-field], .ember-view, .nested-sub-fields, .nested-fields');
        if (container) {
          const cTr = container.querySelector('.ember-power-select-trigger');
          if (cTr) return cTr;
        }
      }
      return null;
    };

    // Helper to search candidate selectors prioritizing visible and enabled triggers
    const pickBestTrigger = (selectors, excludeTr = null) => {
      for (const sel of selectors) {
        const els = Array.from(document.querySelectorAll(sel));
        for (const el of els) {
          const tr = getTriggerFrom(el);
          if (tr && document.body.contains(tr) && tr !== excludeTr) {
            if (!isTriggerDisabled(tr) && isElementVisible(tr)) {
              return tr;
            }
          }
        }
      }
      for (const sel of selectors) {
        const els = Array.from(document.querySelectorAll(sel));
        for (const el of els) {
          const tr = getTriggerFrom(el);
          if (tr && document.body.contains(tr) && tr !== excludeTr) {
            return tr;
          }
        }
      }
      return null;
    };

    // Helper: search by label matching a regex pattern
    const getTriggerByLabel = (regex) => {
      const labels = Array.from(document.querySelectorAll('label, .control-label, .label-text, .ember-power-select-placeholder, .label-field, [class*="label"], [data-test-label]'));
      for (const label of labels) {
        const txt = (label.textContent || '').trim().replace(/\s*\*\s*$/, '').trim();
        const titleAttr = (label.getAttribute('title') || '').trim();
        if (regex.test(txt) || (titleAttr && regex.test(titleAttr))) {
          const directTr = getTriggerFrom(label);
          if (directTr && document.body.contains(directTr)) return directTr;
          const forAttr = label.getAttribute('for');
          if (forAttr) {
            const tr = getTriggerFrom(document.getElementById(forAttr));
            if (tr && document.body.contains(tr)) return tr;
          }
          let sib = label.nextElementSibling;
          while (sib) {
            if (sib.classList.contains('ember-power-select-trigger')) return sib;
            const tr = sib.querySelector('.ember-power-select-trigger');
            if (tr && document.body.contains(tr)) return tr;
            sib = sib.nextElementSibling;
          }
          let p = label.parentElement;
          let depth = 0;
          while (p && p !== document.body && depth < 5) {
            if (p.id === 'ticket-properties' || p.classList.contains('ticket-properties') || p.classList.contains('sidebar-content') || p.tagName === 'FORM') {
              break;
            }
            const triggers = Array.from(p.querySelectorAll('.ember-power-select-trigger'));
            if (triggers.length === 1 && document.body.contains(triggers[0])) {
              return triggers[0];
            }
            if (triggers.length > 1) {
              for (const tr of triggers) {
                if (label.compareDocumentPosition(tr) & Node.DOCUMENT_POSITION_FOLLOWING) {
                  return tr;
                }
              }
            }
            let pSib = p.nextElementSibling;
            if (pSib) {
              if (pSib.classList.contains('ember-power-select-trigger')) return pSib;
              const tr = pSib.querySelector('.ember-power-select-trigger');
              if (tr && document.body.contains(tr)) return tr;
            }
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
        '[data-test-id*="properties-ticket_type" i]',
        '[data-test-id*="properties-type" i]',
        '[data-test-id*="tkt-properties-ticket_type" i]',
        '[data-test-id*="tkt-properties-type" i]',
        '[data-test-select-field="type" i]',
        '[data-test-select-field="ticket_type" i]',
        '[data-test-id="tkt-type" i]',
        '[title="Type" i]',
        '[title*="Type" i]'
      ];
      for (const sel of selectors) {
        const tr = getTriggerFrom(document.querySelector(sel));
        if (tr) return tr;
      }
      const labelTr = getTriggerByLabel(/^type$|^ticket\s*type$/i);
      if (labelTr) return labelTr;
    }

    // 2a. Feedback Type (Negative / Positive / Neutral)
    if (norm === 'feedback type' || norm === 'feedback_type' || (norm.includes('feedback') && norm.includes('type'))) {
      const typeTr = findDropdownTrigger('Type');
      const selectors = [
        '[data-test-id*="cf_feedback_type" i]',
        '[data-test-id*="feedback_type" i]',
        '[data-test-id*="feedback-type" i]',
        '[title="Feedback Type" i]',
        '[title*="Feedback Type" i]',
        '[data-test-select-field*="feedback_type" i]'
      ];
      for (const sel of selectors) {
        const els = Array.from(document.querySelectorAll(sel));
        for (const el of els) {
          const tr = getTriggerFrom(el);
          if (tr && document.body.contains(tr) && tr !== typeTr) return tr;
        }
      }
      const labelTr = getTriggerByLabel(/^feedback\s*type$/i) || getTriggerByLabel(/feedback\s*type/i);
      if (labelTr && document.body.contains(labelTr) && labelTr !== typeTr) return labelTr;
      if (typeTr) {
        const nextTr = getDropdownFollowing(typeTr);
        if (nextTr && nextTr !== typeTr) return nextTr;
      }
    }

    // 2b. Feedback / Feedback Category (Level 1 of nested fields: Products Quality, CX agent, etc.)
    if (norm === 'feedback' || norm === 'feedback category' || norm === 'feedback_category' || (norm.includes('feedback') && (norm.includes('category') || norm.includes('cat')))) {
      const typeTr = findDropdownTrigger('Type');
      const fbTypeTr = findDropdownTrigger('Feedback Type');

      const selectors = [
        '.nested-sub-fields [data-test-id="level-1"]',
        '.nested-fields [data-test-id="level-1"]',
        '[data-test-id="level-1"]',
        '[data-test-id*="level-1" i]',
        '[data-test-id*="cf_feedback_category" i]',
        '[data-test-id*="feedback_category" i]',
        '[title="Feedback Category" i]',
        '[title*="Feedback Category" i]'
      ];
      for (const sel of selectors) {
        const els = Array.from(document.querySelectorAll(sel));
        for (const el of els) {
          const tr = getTriggerFrom(el);
          if (tr && document.body.contains(tr) && tr !== typeTr && tr !== fbTypeTr) return tr;
        }
      }
      const nestedContainer = document.querySelector('.nested-sub-fields, .nested-fields, .nested-field-group, [data-test-id*="nested" i]');
      if (nestedContainer) {
        const triggers = Array.from(nestedContainer.querySelectorAll('.ember-power-select-trigger'));
        if (triggers.length >= 1 && triggers[0] !== typeTr && triggers[0] !== fbTypeTr) {
          return triggers[0];
        }
      }
      const labelTr = getTriggerByLabel(/^feedback$/i) || getTriggerByLabel(/^feedback\s*category$/i) || getTriggerByLabel(/feedback\s*category/i);
      if (labelTr && document.body.contains(labelTr) && labelTr !== typeTr && labelTr !== fbTypeTr) return labelTr;
      if (fbTypeTr) {
        const nextTr = getDropdownFollowing(fbTypeTr);
        if (nextTr && nextTr !== typeTr && nextTr !== fbTypeTr) return nextTr;
      }
    }

    // 2c. Internal Request Type (Level 1 - Rider Support / Resturant Support)
    if (norm === 'internal request type' || (norm.includes('internal') && (norm.includes('request type') || norm.includes('category') || norm.includes('support')))) {
      const selectors = [
        '[title="Internal Request Type" i]',
        '[title*="Internal Request Type" i]',
        '[data-test-id*="internal_request_type" i]',
        '[data-test-id*="cf_internal_request_type" i]',
        '[data-test-id*="internal_type" i]',
        '[data-test-id*="cf_internal_type" i]',
        '[data-test-id="level-1" i]',
        '[data-test-id*="level-1" i]'
      ];
      for (const sel of selectors) {
        const tr = getTriggerFrom(document.querySelector(sel));
        if (tr && document.body.contains(tr)) return tr;
      }
      const labelTr = getTriggerByLabel(/^internal\s*request\s*type$/i) || getTriggerByLabel(/internal\s*request\s*type/i);
      if (labelTr && document.body.contains(labelTr)) return labelTr;
    }

    // 3a. Feedback Details (Level 2 of nested fields: Quality, Damaged, Taste, Foreign object, Expiry date preference, Size)
    if (norm === 'feedback details' || norm === 'feedback detail' || norm === 'feedback_details' || (norm.includes('feedback') && (norm.includes('detail') || norm.includes('sub')))) {
      const typeTr = findDropdownTrigger('Type');
      const fbTypeTr = findDropdownTrigger('Feedback Type');
      const fbCatTr = findDropdownTrigger('Feedback');

      const selectors = [
        '.nested-sub-fields [data-test-id="level-2"]',
        '.nested-fields [data-test-id="level-2"]',
        '[data-test-id="level-2"]',
        '[data-test-id*="level-2" i]',
        '[data-test-id*="Feedback Details" i]',
        '[data-test-id*="cf_feedback_details" i]',
        '[data-test-id*="feedback_details" i]',
        '[data-test-id*="feedback-detail" i]',
        '[title="Feedback Details" i]',
        '[title*="Feedback Details" i]'
      ];
      for (const sel of selectors) {
        const els = Array.from(document.querySelectorAll(sel));
        for (const el of els) {
          const tr = getTriggerFrom(el);
          if (tr && document.body.contains(tr) && tr !== typeTr && tr !== fbTypeTr && tr !== fbCatTr) return tr;
        }
      }
      const nestedContainer = document.querySelector('.nested-sub-fields, .nested-fields, .nested-field-group, [data-test-id*="nested" i]');
      if (nestedContainer) {
        const triggers = Array.from(nestedContainer.querySelectorAll('.ember-power-select-trigger'));
        if (triggers.length >= 2 && triggers[1] !== typeTr && triggers[1] !== fbTypeTr && triggers[1] !== fbCatTr) {
          return triggers[1];
        }
      }
      const labelTr = getTriggerByLabel(/^feedback\s*details?$/i) || getTriggerByLabel(/feedback\s*detail/i);
      if (labelTr && document.body.contains(labelTr) && labelTr !== typeTr && labelTr !== fbTypeTr && labelTr !== fbCatTr) return labelTr;
      if (fbCatTr) {
        const nextTr = getDropdownFollowing(fbCatTr);
        if (nextTr && nextTr !== typeTr && nextTr !== fbTypeTr && nextTr !== fbCatTr) return nextTr;
      }
    }

    // 3b. Internal Request (Level 2 - Details / Issue)
    if (norm === 'internal request' || norm === 'internal requests' || (norm.includes('internal') && !norm.includes('type') && (norm.includes('detail') || norm.includes('req') || norm.includes('issue')))) {
      const selectors = [
        '[data-test-id="level-2" i]',
        '[data-test-id*="level-2" i]',
        '[data-test-id*="level_2" i]',
        '.nested-sub-fields [data-test-id*="level-2" i]',
        '.nested-level-2-group .ember-power-select-trigger',
        '.nested-sub-fields .ember-power-select-trigger',
        '[title="Internal Request" i]',
        '[data-test-id*="internal_request_detail" i]',
        '[data-test-id*="cf_internal_request_detail" i]',
        '[data-test-id*="cf_internal_request" i]:not([data-test-id*="type" i])',
        '[data-test-id*="internal_request" i]:not([data-test-id*="type" i])'
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
      const labelTr = getTriggerByLabel(/^internal\s*request$/i);
      if (labelTr && document.body.contains(labelTr)) return labelTr;
    }

    // 4. Complaint Category Food Agg (Level 1) — ONLY target Food Agg, SKIP Supermarket
    if (norm === 'complaint category' || (norm.includes('complaint') && (norm.includes('category') || norm.includes('cat'))) || norm === 'category') {
      const selectors = [
        '[data-test-id*="cf_complaint_category_food_agg" i]',
        '[data-test-id*="complaint_category_food_agg" i]',
        '[title*="Complaint Category Food Agg" i]',
        '[title="Complaint Category Food Agg" i]'
      ];
      let tr = pickBestTrigger(selectors);
      if (tr) return tr;

      // Label-based: match Food Agg specifically, never Supermarket
      const labelTr = getTriggerByLabel(/complaint\s*category\s*food\s*agg/i);
      if (labelTr && document.body.contains(labelTr)) return labelTr;

      // Fallback: search all complaint category triggers but SKIP any with "supermarket" in data-test-id or title
      const fallbackSelectors = [
        '[data-test-id*="cf_complaint_category" i]:not([data-test-id*="buddy" i]):not([data-test-id*="supermarket" i])',
        '[data-test-id*="complaint_category" i]:not([data-test-id*="buddy" i]):not([data-test-id*="supermarket" i])',
        '[title*="Complaint Category" i]:not([title*="Buddy" i]):not([title*="Supermarket" i])'
      ];
      tr = pickBestTrigger(fallbackSelectors);
      if (tr) return tr;

      // Last resort: try label but skip any that mention supermarket
      const fallbackLabel = getTriggerByLabel(/complaint\s*category(?!.*supermarket)/i);
      if (fallbackLabel && document.body.contains(fallbackLabel)) return fallbackLabel;
    }

    // 5. Complaint Details Food Agg (Level 2) — ONLY target Food Agg, SKIP Supermarket
    if (norm === 'complaint details' || norm === 'complaint detail' || (norm.includes('complaint') && (norm.includes('detail') || norm.includes('sub'))) || norm === 'detail' || norm === 'details' || norm.includes('sub_category') || norm.includes('subcategory')) {
      const l1Tr = findDropdownTrigger('Complaint Category');
      const selectors = [
        '[data-test-id*="Complaint Details Food Agg" i]',
        '[data-test-id*="complaint_details_food_agg" i]',
        '[data-test-id*="cf_complaint_details_food_agg" i]',
        '[title*="Complaint Details Food Agg" i]',
        '[title="Complaint Details Food Agg" i]'
      ];
      let tr = pickBestTrigger(selectors, l1Tr);
      if (tr) return tr;

      // Label-based: match Food Agg specifically, never Supermarket
      const labelTr = getTriggerByLabel(/complaint\s*detail.*food\s*agg/i);
      if (labelTr && document.body.contains(labelTr) && labelTr !== l1Tr) return labelTr;

      // Fallback: search all complaint details triggers but SKIP any with "supermarket" in data-test-id or title
      const fallbackSelectors = [
        '[data-test-id*="complaint_details" i]:not([data-test-id*="buddy" i]):not([data-test-id*="supermarket" i])',
        '[data-test-id*="cf_complaint_details" i]:not([data-test-id*="buddy" i]):not([data-test-id*="supermarket" i])',
        '[title*="Complaint Details" i]:not([title*="Buddy" i]):not([title*="Supermarket" i])'
      ];
      tr = pickBestTrigger(fallbackSelectors, l1Tr);
      if (tr) return tr;

      // Nested container fallback
      const nestedContainer = document.querySelector('.nested-sub-fields, .nested-fields, .nested-field-group, [data-test-id*="nested" i]');
      if (nestedContainer) {
        const triggers = Array.from(nestedContainer.querySelectorAll('.ember-power-select-trigger'));
        if (triggers.length >= 2 && triggers[1] !== l1Tr && document.body.contains(triggers[1])) {
          return triggers[1];
        }
      }

      // Last resort label fallback, skip supermarket
      const fallbackLabel = getTriggerByLabel(/complaint\s*detail(?!.*supermarket)/i);
      if (fallbackLabel && document.body.contains(fallbackLabel) && fallbackLabel !== l1Tr) return fallbackLabel;

      if (l1Tr) {
        const nextTr = getDropdownFollowing(l1Tr);
        if (nextTr && nextTr !== l1Tr && document.body.contains(nextTr)) return nextTr;
      }
    }

    // 6. Quality (Level 3 - Dependent on Products Quality)
    if (norm === 'quality' || norm.includes('quality') || norm.includes('level-3') || norm.includes('level_3')) {
      const l1Tr = findDropdownTrigger('Complaint Category');
      const l2Tr = findDropdownTrigger('Complaint Details');
      const selectors = [
        '[data-test-id*="quality" i]',
        '[data-test-id="level-3" i]',
        '[data-test-id*="level-3" i]',
        '[data-test-id*="level_3" i]',
        '.nested-sub-fields [data-test-id*="level-3" i]',
        '[title*="Quality" i]'
      ];
      for (const sel of selectors) {
        const els = Array.from(document.querySelectorAll(sel));
        for (const el of els) {
          const tr = getTriggerFrom(el);
          if (tr && document.body.contains(tr) && tr !== l1Tr && tr !== l2Tr) return tr;
        }
      }

      // Check 3rd trigger in nested field containers if present
      const nestedContainer = document.querySelector('.nested-sub-fields, .nested-field-group, [data-test-id*="nested" i]');
      if (nestedContainer) {
        const triggers = Array.from(nestedContainer.querySelectorAll('.ember-power-select-trigger'));
        if (triggers.length >= 3 && document.body.contains(triggers[2]) && triggers[2] !== l1Tr && triggers[2] !== l2Tr) {
          return triggers[2];
        }
      }

      const labelTr = getTriggerByLabel(/^quality$/i);
      if (labelTr && document.body.contains(labelTr) && labelTr !== l1Tr && labelTr !== l2Tr) return labelTr;
    }

    // 7. Business Unit
    if (norm.includes('business unit') || norm.includes('business_unit') || norm === 'bu') {
      const selectors = [
        '[data-test-id*="business_unit" i]',
        '[data-test-id*="business-unit" i]',
        '[data-test-id*="cf_business_unit" i]',
        '[data-test-id*="tkt-properties-cf_business_unit" i]',
        '[data-test-id*="tkt-properties-business_unit" i]',
        '[title*="Business unit" i]',
        '[title*="Business Unit" i]',
        '[data-test-select-field*="business" i]'
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
    // Kairos BUTTON combobox: compare its visible value span (plural-insensitive: Complaint == Complaints)
    if (isKairos && trigger.tagName === 'BUTTON') {
      const cur = getKairosTriggerText(trigger);
      if (!cur) return false;
      const low = cur.trim().toLowerCase();
      if (low === '--' || low === 'any' || low.startsWith('select') || low.includes('choose')) return false;
      return kairosTextMatch(cur, optionText) || kairosDoubledMatch(cur, optionText);
    }
    if (trigger.querySelector('.ember-power-select-placeholder')) return false;

    const norm = (s) => (s || '').trim().toLowerCase()
      .replace(/resturant/g, 'restaurant')
      .replace(/requests/g, 'request')
      .replace(/challnages/g, 'challenges');

    const target = norm(optionText);
    const targetClean = target.replace(/[^a-z0-9]/g, '');
    if (!targetClean) return false;

    const isMatch = (rawText) => {
      const cur = norm(rawText);
      if (!cur || cur === '--' || cur === 'any' || cur.startsWith('select') || cur.includes('choose')) {
        return false;
      }
      const curClean = cur.replace(/[^a-z0-9]/g, '');
      if (!curClean || curClean === 'any') return false;

      // Exact match or alphanumeric normalized match
      if (cur === target || curClean === targetClean) return true;

      // Compound segment matches (e.g. "Over cooked / burnt" vs "Over cooked")
      const segments = cur.split(/[/\\&>-]/).map(p => p.trim().replace(/[^a-z0-9]/g, ''));
      if (segments.some(p => p === targetClean)) return true;

      return false;
    };

    // Check selected item container
    const selectedItem = trigger.querySelector('.ember-power-select-selected-item, .trigger-power-select, .ember-power-select-trigger-string, [data-test-id*="selected-item"]');
    if (selectedItem && isMatch(selectedItem.textContent)) {
      return true;
    }

    // Check trigger text
    if (isMatch(trigger.textContent)) {
      return true;
    }

    return false;
  };

  let currentAutomationToken = 0;

  const closeHangingDropdowns = () => {
    try {
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
    } catch (e) { }

    try {
      const outside = document.querySelector('.main-header, #app-header, body') || document.body;
      ['mousedown', 'mouseup', 'click'].forEach(type => {
        outside.dispatchEvent(new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: 10,
          clientY: 10,
          button: 0,
          buttons: 0
        }));
      });
    } catch (e) { }
  };

  const assertDropdown = async (fieldName, optionText, maxWaitMs = 6000) => {
    if (!fieldName || !optionText) return false;
    const myToken = currentAutomationToken;
    const isAborted = () => myToken !== currentAutomationToken;

    const startTime = Date.now();

    // Helper to get active, mounted, and ENABLED trigger from DOM
    const getLiveTrigger = () => {
      const tr = findDropdownTrigger(fieldName);
      if (tr && document.body.contains(tr) && !isTriggerDisabled(tr)) {
        return tr;
      }
      return null;
    };

    // 1. Wait for trigger to exist and be enabled
    let trigger = null;
    while (Date.now() - startTime < maxWaitMs) {
      if (isAborted()) return false;
      trigger = getLiveTrigger();
      if (trigger) break;
      await new Promise(r => setTimeout(r, 20));
    }

    if (isAborted()) return false;
    if (!trigger) {
      trigger = findDropdownTrigger(fieldName);
      if (!trigger || !document.body.contains(trigger)) {
        console.log(`[BF Extension] Trigger "${fieldName}" not available.`);
        return false;
      }
    }

    // 2. Already selected?
    if (isDropdownSelected(trigger, optionText)) {
      return true;
    }

    // ===== KAIROS BUTTON+UL flow (Vue combobox with search filter) =====
    if (isKairos && trigger.tagName === 'BUTTON') {
      maxWaitMs = Math.min(maxWaitMs, 3000);
      const getDropdownBox = (btn) => {
        // structure: div.relative > div > button + div.absolute (dropdown)
        const wrap = btn.closest('div.relative');
        if (!wrap) return null;
        return wrap.querySelector(':scope div.absolute');
      };
      const isBoxOpen = (box) => !!(box && box.style.display !== 'none');
      const clickBtn = (btn) => { try { btn.focus(); } catch (e) {} try { btn.click(); } catch (e) {} };

      let box = getDropdownBox(trigger);
      if (!isBoxOpen(box)) {
        clickBtn(trigger);
        const t0 = Date.now();
        while (Date.now() - t0 < 700) {
          if (isAborted()) return false;
          box = getDropdownBox(trigger);
          if (isBoxOpen(box)) break;
          await new Promise(r => setTimeout(r, 30));
        }
      }
      // Type into the search input to filter (simplified query: first slash-token, so
      // Kairos substring filter matches despite spacing differences like "Services/Order Timing")
      const filterQuery = (() => {
        const tok = (optionText || '').split('/')[0].trim();
        return tok.length >= 3 ? tok : optionText;
      })();
      try {
        box = getDropdownBox(trigger);
        const search = box?.querySelector('input[type="search"]');
        if (search) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (nativeSetter) nativeSetter.call(search, filterQuery);
          else search.value = filterQuery;
          search.dispatchEvent(new Event('input', { bubbles: true }));
          search.dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise(r => setTimeout(r, 150));
        }
      } catch (e) {}
      // Find + click the option (re-query after filter; options may load async ~1s after parent change)
      let kOpt = null;
      const optStart = Date.now();
      let cleared = false;
      while (Date.now() - optStart < 2000) {
        if (isAborted()) return false;
        kOpt = findOptionInDOM(optionText);
        if (kOpt) break;
        // halfway: clear the filter once in case it hides the option, then keep polling unfiltered
        if (!cleared && Date.now() - optStart > 800) {
          cleared = true;
          try {
            box = getDropdownBox(trigger);
            const search = box?.querySelector('input[type="search"]');
            if (search) {
              const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
              if (nativeSetter) nativeSetter.call(search, '');
              else search.value = '';
              search.dispatchEvent(new Event('input', { bubbles: true }));
            }
          } catch (e) {}
        }
        await new Promise(r => setTimeout(r, 100));
      }
      if (!kOpt) {
        console.warn(`[BF Extension] Option "${optionText}" not found for "${fieldName}".`);
        try { clickBtn(trigger); } catch (e) {}
        return false;
      }
      try { kOpt.scrollIntoView({ block: 'nearest' }); } catch (e) {}
      await new Promise(r => setTimeout(r, 60));
      // Full mouse sequence (Vue commits reliably) + blur the filter so the
      // child cascade level loads.
      try {
        kOpt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, button: 0 }));
        kOpt.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, button: 0 }));
        kOpt.click();
      } catch (e) {}
      try {
        box = getDropdownBox(findDropdownTrigger(fieldName) || trigger);
        const sInput = box?.querySelector('input[type="search"]');
        if (sInput && sInput.blur) sInput.blur();
      } catch (e) {}
      // Verify (Vue reactivity may remount the button — re-query trigger)
      const t1 = Date.now();
      while (Date.now() - t1 < 900) {
        if (isAborted()) return false;
        const curTr = findDropdownTrigger(fieldName) || trigger;
        if (isDropdownSelected(curTr, optionText)) return true;
        await new Promise(r => setTimeout(r, 50));
      }
      // Accept as success if click went through even if text check lags (dropdown closed = likely selected)
      box = getDropdownBox(findDropdownTrigger(fieldName) || trigger);
      if (!isBoxOpen(box)) return true;
      return true;
    }

    const mouseClick = (el) => {
      if (!el) return;
      try { el.focus(); } catch (e) { }

      // Temporary monkeypatch to trick Radix UI "click outside" listeners
      const origComposedPath = Event.prototype.composedPath;
      const origContains = Node.prototype.contains;
      Event.prototype.composedPath = function() {
        const path = origComposedPath.call(this);
        const modal = document.querySelector('[role="dialog"], [data-testid*="compose"]') || document.body;
        if (!path.includes(modal)) path.push(modal, document.body, document.documentElement, document, window);
        return path;
      };
      Node.prototype.contains = function(target) {
        if (this === document || this === document.body || (this.matches && this.matches('[role="dialog"], [data-testid*="compose"], #app'))) return true;
        return origContains.call(this, target);
      };

      try {
        if (window.PointerEvent) {
          el.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            view: window,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            buttons: 1
          }));
        }
        el.dispatchEvent(new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          view: window,
          button: 0,
          buttons: 1
        }));
        if (window.PointerEvent) {
          el.dispatchEvent(new PointerEvent('pointerup', {
            bubbles: true,
            cancelable: true,
            view: window,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            buttons: 0
          }));
        }
        el.dispatchEvent(new MouseEvent('mouseup', {
          bubbles: true,
          cancelable: true,
          view: window,
          button: 0,
          buttons: 0
        }));
      } catch (e) { }
      try {
        el.click();
      } catch (e) { }
      finally {
        // Restore monkeypatches
        Event.prototype.composedPath = origComposedPath;
        Node.prototype.contains = origContains;
      }
    };

    const simpleClick = (el) => {
      if (!el) return;
      try { if (typeof el.focus === 'function') el.focus(); } catch(e) {}
      try { if (typeof el.click === 'function') el.click(); } catch(e) {}
    };

    const isOptionOpen = () => {
      const openOpt = findOptionInDOM(optionText);
      return !!(openOpt && document.body.contains(openOpt) && openOpt.offsetHeight > 0);
    };

    // 3. Open dropdown if not open
    if (!isOptionOpen()) {
      mouseClick(trigger);
      const waitOpenStart = Date.now();
      while (Date.now() - waitOpenStart < 600) {
        if (isOptionOpen() || isAborted()) break;
        await new Promise(r => setTimeout(r, 25));
      }
    }

    if (isAborted()) return false;

    // 4. Find option
    let opt = findOptionInDOM(optionText);
    if (!opt) {
      // Retry opening once
      mouseClick(trigger);
      const waitOpen2 = Date.now();
      while (Date.now() - waitOpen2 < 800) {
        opt = findOptionInDOM(optionText);
        if (opt || isAborted()) break;
        await new Promise(r => setTimeout(r, 30));
      }
    }

    if (isAborted()) return false;

    if (!opt) {
      console.warn(`[BF Extension] Option "${optionText}" not found for "${fieldName}".`);
      return false;
    }

    // 5. Select option using simple click to prevent modal dismissal
    simpleClick(opt);

    // 6. Verify selection with timeout
    const waitSelectStart = Date.now();
    while (Date.now() - waitSelectStart < 800) {
      if (isAborted()) return false;
      const currentTr = getLiveTrigger() || trigger;
      if (isDropdownSelected(currentTr, optionText)) {
        return true;
      }
      await new Promise(r => setTimeout(r, 30));
    }

    return true;
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

    if (activeTreePromise) {
      try { await activeTreePromise; } catch (e) { }
    }

    const run = async () => {
      const isNewTicketPage = window.location.pathname.startsWith('/a/tickets/new');
      const myToken = currentAutomationToken;
      const isAborted = () => myToken !== currentAutomationToken;

      // 0. Ensure Properties sidepanel is open on Kairos — NEVER click tab if panel fields are already visible!
      if (isKairos) {
        const hasFields = !!(findDropdownTrigger('Type') || findDropdownTrigger('Business unit'));
        if (!hasFields) {
          const propTab = document.querySelector('button[data-testid="conversation-sidepanel-tab-properties"], button[data-testid*="sidepanel-tab-properties"]');
          if (propTab && propTab.getAttribute('aria-pressed') !== 'true') {
            try { propTab.click(); } catch (e) { }
            await new Promise(r => setTimeout(r, 250));
          }
        }
      }

      // 0b. Set Subject immediately if on new ticket creation page
      if (isNewTicketPage) {
        setTicketSubject(category, detail, subDetail);
      }

      // 1. Ensure Business unit is set to Food Aggregation
      const buTr = findDropdownTrigger('Business unit');
      if (buTr) {
        if (!isDropdownSelected(buTr, 'Food Aggregation')) {
          console.log('[BF Extension] Setting Business unit: Food Aggregation...');
          showToast('Setting Business unit: Food Aggregation...', 'info');
          const buOk = await assertDropdown('Business unit', 'Food Aggregation', 6000);
          if (isAborted()) return false;
          if (buOk) {
            await new Promise(r => setTimeout(r, 100));
          }
        } else {
          console.log('[BF Extension] Business unit is already Food Aggregation.');
        }
      }

      // 2. Route by Tree Type
      const isComplain = (treeType || '').toLowerCase().includes('complain');
      const isFeedback = (treeType || '').toLowerCase().includes('feedback');

      if (isComplain) {
        // Step A: Type = Complaint
        const curTypeTr = findDropdownTrigger('Type');
        if (!curTypeTr || !isDropdownSelected(curTypeTr, 'Complaint')) {
          console.log('[BF Extension] Setting Type to Complaint...');
          showToast('Setting Type: Complaint...', 'info');
          let typeOk = await assertDropdown('Type', 'Complaint', 6000);
          console.log('[BF Extension] Type Complaint result:', typeOk);
          if (isAborted()) return false;
          // Wait for Kairos Vue reactivity to mount Food Aggregation complaint
          await new Promise(r => setTimeout(r, isKairos ? 150 : 80));
          if (isAborted()) return false;
        } else {
          console.log('[BF Extension] Type is already Complaint.');
        }

        // Step B: Food Aggregation complaint (Category)
        const targetComplaintField = isKairos ? 'Food Aggregation complaint' : 'Food Aggregation Complaint';
        if (category) {
          const waitCat = Date.now();
          while (Date.now() - waitCat < 2500) {
            if (isAborted()) return false;
            const tr = findDropdownTrigger(targetComplaintField) || findDropdownTrigger('Complaint');
            if (tr && document.body.contains(tr) && !isTriggerDisabled(tr)) break;
            await new Promise(r => setTimeout(r, 25));
          }
          if (isAborted()) return false;

          const curCatTr = findDropdownTrigger(targetComplaintField) || findDropdownTrigger('Complaint');
          if (!curCatTr || !isDropdownSelected(curCatTr, category)) {
            console.log(`[BF Extension] Setting Food Aggregation complaint to "${category}"...`);
            showToast(`Setting Category: ${category}...`, 'info');
            let catOk = await assertDropdown(targetComplaintField, category, 6000);
            if (!catOk && !isKairos) {
              catOk = await assertDropdown('Complaint', category, 3000);
            }
            console.log(`[BF Extension] Category "${category}" result:`, catOk);
            if (isAborted()) return false;
            // Wait for Kairos Vue reactivity to mount Sub-category
            await new Promise(r => setTimeout(r, isKairos ? 150 : 80));
            if (isAborted()) return false;
          } else {
            console.log(`[BF Extension] Food Aggregation complaint is already "${category}".`);
          }
        }

        // Step C: Sub-category (Detail)
        if (detail) {
          const waitDet = Date.now();
          while (Date.now() - waitDet < 2500) {
            if (isAborted()) return false;
            const tr = findDropdownTrigger('Sub-category') || findDropdownTrigger('Complaint Sub-Category');
            if (tr && document.body.contains(tr) && !isTriggerDisabled(tr)) break;
            await new Promise(r => setTimeout(r, 25));
          }
          if (isAborted()) return false;

          const curDetTr = findDropdownTrigger('Sub-category') || findDropdownTrigger('Complaint Sub-Category');
          if (!curDetTr || !isDropdownSelected(curDetTr, detail)) {
            console.log(`[BF Extension] Setting Sub-category to "${detail}"...`);
            showToast(`Setting Sub-category: ${detail}...`, 'info');
            let detOk = await assertDropdown('Sub-category', detail, 6000);
            if (!detOk && !isKairos) {
              detOk = await assertDropdown('Complaint Sub-Category', detail, 3000);
            }
            console.log(`[BF Extension] Sub-category "${detail}" result:`, detOk);
            if (isAborted()) return false;
            // Wait for Kairos Vue reactivity to mount Detail
            await new Promise(r => setTimeout(r, isKairos ? 150 : 80));
            if (isAborted()) return false;
          } else {
            console.log(`[BF Extension] Sub-category is already "${detail}".`);
          }
        }

        // Step D: Detail (SubDetail)
        if (subDetail) {
          const waitSub = Date.now();
          while (Date.now() - waitSub < 2500) {
            if (isAborted()) return false;
            const tr = findDropdownTrigger('Detail') || findDropdownTrigger('Complaint Details');
            if (tr && document.body.contains(tr) && !isTriggerDisabled(tr)) break;
            await new Promise(r => setTimeout(r, 25));
          }
          if (isAborted()) return false;

          const curSubTr = findDropdownTrigger('Detail') || findDropdownTrigger('Complaint Details');
          if (!curSubTr || !isDropdownSelected(curSubTr, subDetail)) {
            console.log(`[BF Extension] Setting Detail to "${subDetail}"...`);
            showToast(`Setting Detail: ${subDetail}...`, 'info');
            let subOk = await assertDropdown('Detail', subDetail, 6000);
            if (!subOk && !isKairos) {
              subOk = await assertDropdown('Complaint Details', subDetail, 3000);
            }
            console.log(`[BF Extension] Detail "${subDetail}" result:`, subOk);
          } else {
            console.log(`[BF Extension] Detail is already "${subDetail}".`);
          }
        }

        if (isNewTicketPage) {
          setTicketSubject(category, detail, subDetail);
        }
        await new Promise(r => setTimeout(r, 30));
        showToast('Complaint filled successfully!', 'success');
        return true;

      } else if (isFeedback) {
        // Step A0: Type = Feedback
        const curTypeTr = findDropdownTrigger('Type');
        if (!curTypeTr || !isDropdownSelected(curTypeTr, 'Feedback')) {
          console.log('[BF Extension] Setting Type to Feedback...');
          showToast('Setting Type: Feedback...', 'info');
          let typeOk = await assertDropdown('Type', 'Feedback', 6000);
          console.log('[BF Extension] Type Feedback result:', typeOk);
          if (isAborted()) return false;
          // Wait for Kairos Vue reactivity to mount Feedback type
          await new Promise(r => setTimeout(r, isKairos ? 150 : 80));
          if (isAborted()) return false;
        } else {
          console.log('[BF Extension] Type is already Feedback.');
        }

        let fbType = (subDetail && subDetail.trim()) ? category : '';
        let fbCategory = (subDetail && subDetail.trim()) ? detail : category;
        let fbDetails = (subDetail && subDetail.trim()) ? subDetail : detail;

        // Step A: Feedback type (e.g. Products, App, Delivery, etc.)
        if (fbType) {
          const waitFbType = Date.now();
          while (Date.now() - waitFbType < 2500) {
            if (isAborted()) return false;
            const tr = findDropdownTrigger('Feedback type');
            if (tr && document.body.contains(tr) && !isTriggerDisabled(tr)) break;
            await new Promise(r => setTimeout(r, 25));
          }
          if (isAborted()) return false;

          const curFbTypeTr = findDropdownTrigger('Feedback type');
          if (!curFbTypeTr || !isDropdownSelected(curFbTypeTr, fbType)) {
            console.log(`[BF Extension] Setting Feedback type to "${fbType}"...`);
            showToast(`Setting Feedback type: ${fbType}...`, 'info');
            let fbTypeOk = await assertDropdown('Feedback type', fbType, 6000);
            console.log(`[BF Extension] Feedback type "${fbType}" result:`, fbTypeOk);
            if (isAborted()) return false;
            // Wait for Kairos Vue reactivity to mount Sub-category
            await new Promise(r => setTimeout(r, isKairos ? 150 : 80));
            if (isAborted()) return false;
          } else {
            console.log(`[BF Extension] Feedback type is already "${fbType}".`);
          }
        }

        // Step B: Sub-category (e.g. Products Quality, CX agent, etc.)
        if (fbCategory) {
          const waitFbCat = Date.now();
          const targetFbCatField = isKairos ? 'Sub-category' : 'Feedback Category';
          while (Date.now() - waitFbCat < 2500) {
            if (isAborted()) return false;
            const tr = findDropdownTrigger(targetFbCatField) || findDropdownTrigger('Feedback');
            if (tr && document.body.contains(tr) && !isTriggerDisabled(tr)) break;
            await new Promise(r => setTimeout(r, 25));
          }
          if (isAborted()) return false;

          const curCatTr = findDropdownTrigger(targetFbCatField) || findDropdownTrigger('Feedback');
          if (!curCatTr || !isDropdownSelected(curCatTr, fbCategory)) {
            console.log(`[BF Extension] Setting Sub-category to "${fbCategory}"...`);
            showToast(`Setting Sub-category: ${fbCategory}...`, 'info');
            let catOk = await assertDropdown(targetFbCatField, fbCategory, 6000);
            if (!catOk && !isKairos) {
              catOk = await assertDropdown('Feedback', fbCategory, 3000);
            }
            console.log(`[BF Extension] Sub-category "${fbCategory}" result:`, catOk);
            if (isAborted()) return false;
            // Wait for Kairos Vue reactivity to mount Detail
            await new Promise(r => setTimeout(r, isKairos ? 150 : 80));
            if (isAborted()) return false;
          } else {
            console.log(`[BF Extension] Sub-category is already "${fbCategory}".`);
          }
        }

        // Step C: Detail (e.g. Taste, Quality, Damaged, Size, etc.)
        if (fbDetails) {
          const waitFbDet = Date.now();
          const targetFbDetField = isKairos ? 'Detail' : 'Feedback Details';
          while (Date.now() - waitFbDet < 2500) {
            if (isAborted()) return false;
            const tr = findDropdownTrigger(targetFbDetField);
            if (tr && document.body.contains(tr) && !isTriggerDisabled(tr)) break;
            await new Promise(r => setTimeout(r, 25));
          }
          if (isAborted()) return false;

          const curDetTr = findDropdownTrigger(targetFbDetField);
          if (!curDetTr || !isDropdownSelected(curDetTr, fbDetails)) {
            console.log(`[BF Extension] Setting Detail to "${fbDetails}"...`);
            showToast(`Setting Detail: ${fbDetails}...`, 'info');
            let detOk = await assertDropdown(targetFbDetField, fbDetails, 6000);
            console.log(`[BF Extension] Detail "${fbDetails}" result:`, detOk);
          } else {
            console.log(`[BF Extension] Detail is already "${fbDetails}".`);
          }
        }

        if (isNewTicketPage) {
          setTicketSubject(category, detail, subDetail);
        }
        await new Promise(r => setTimeout(r, 30));
        showToast('Feedback filled successfully!', 'success');
        return true;
      } else if ((treeType || '').toLowerCase().includes('internal')) {
        if (category) {
          await assertDropdown('Internal Request Category', category, 3000);
        }
        if (detail) {
          const waitInt = Date.now();
          while (Date.now() - waitInt < 3000) {
            if (isAborted()) return false;
            const tr = findDropdownTrigger('Internal Request') || findDropdownTrigger('Internal Request Details');
            if (tr && document.body.contains(tr) && !isTriggerDisabled(tr)) break;
            await new Promise(r => setTimeout(r, 15));
          }
          if (isAborted()) return false;

          let intOk = false;
          for (let attempt = 0; attempt < 3 && !intOk; attempt++) {
            if (attempt > 0) await new Promise(r => setTimeout(r, 60));
            intOk = await assertDropdown('Internal Request', detail, 3000);
            if (!intOk) {
              intOk = await assertDropdown('Internal Request Details', detail, 2000);
            }
          }
        }

        if (isNewTicketPage) {
          setTicketSubject(category, detail, subDetail);
        }
        await new Promise(r => setTimeout(r, 30));
        showToast('Classification updated successfully!', 'success');
        return true;
      }

      return false;
    };

    activeTreePromise = run().finally(() => {
      activeTreePromise = null;
    });

    return await activeTreePromise;
  };
  function resetExtensionTool() {
    currentAutomationToken++;
    activeTreePromise = null;

    // 1. Remove all modals & backdrops
    const modalSelectors = [
      '#bf-custom-link-backdrop',
      '#bf-custom-link-modal',
      '#bf-email-modal',
      '#bf-percentage-calc-modal',
      '#bf-delay-modal',
      '#bf-continue-tree-btn',
      '#bf-settings-panel'
    ];
    modalSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        try { el.remove(); } catch (e) { }
      });
    });

    // 2. Remove any detached or floating menus
    document.querySelectorAll('.bf-tree-menu, .bf-sheets-menu, .bf-system-menu').forEach(el => {
      try { el.remove(); } catch (e) { }
    });

    // 3. Close open Ember dropdowns if any
    try {
      const openTr = document.querySelector('.ember-basic-dropdown-trigger--expanded, .ember-power-select-trigger--active');
      if (openTr) {
        ['mousedown', 'mouseup', 'click'].forEach(type => {
          try {
            openTr.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
          } catch (err) { }
        });
        try { openTr.click(); } catch (err) { }
      }
      const overlay = document.querySelector('.ember-basic-dropdown-overlay');
      if (overlay) {
        try { overlay.click(); } catch (err) { }
      }
    } catch (e) { }

    // 4. Remove current toolbar container and dock tab
    const oldContainer = document.getElementById('bf-custom-ticket-buttons');
    if (oldContainer) {
      try { oldContainer.remove(); } catch (e) { }
    }
    const oldTab = document.getElementById('bf-dock-toggle-tab');
    if (oldTab) {
      try { oldTab.remove(); } catch (e) { }
    }
    try {
      localStorage.removeItem('bf_buttons_collapsed');
    } catch (e) { }

    // 5. Rebuild toolbar cleanly
    ensureButtons();

    // 6. Notify user
    showToast('✓ Extension reset successfully!', 'info');
  }

  try {
    window.bfResetExtension = resetExtensionTool;
  } catch (e) { }

  // =========================================================================
  // Breadfast Order Number Validation & Normalization Engine
  // Strictly enforces format: 1234-567890123 (4 digits - 5 to 14 digits)
  // Strictly rejects Freshdesk Ticket IDs (e.g. 12345678) and plain numbers
  // =========================================================================
  function normalizeOrderNumber(val) {
    if (!val || typeof val !== 'string') return '';
    const m = val.match(/(?<!\d)(\d{4})\s*[-–—]\s*(\d{5,14})(?!\d)/);
    return m ? `${m[1]}-${m[2]}` : '';
  }

  function isValidOrderNumber(val) {
    if (!val || typeof val !== 'string') return false;
    const normalized = normalizeOrderNumber(val);
    if (!normalized) return false;
    if (!/^\d{4}-\d{5,14}$/.test(normalized)) return false;
    // Strictly prevent ticket IDs (like 12345678) from matching
    const curMatch = window.location.pathname.match(/\/a\/tickets\/(\d+)/);
    const curTicketId = curMatch ? curMatch[1] : (new URLSearchParams(window.location.search).get('ticket_id') || null);
    if (curTicketId && (normalized === curTicketId || normalized.replace('-', '') === curTicketId)) {
      return false;
    }
    return true;
  }

  function extractOrderPattern(text) {
    if (!text || typeof text !== 'string') return null;
    const m = text.match(/(?<!\d)(\d{4})\s*[-–—]\s*(\d{5,14})(?!\d)/);
    if (m) {
      const candidate = `${m[1]}-${m[2]}`;
      if (isValidOrderNumber(candidate)) return candidate;
    }
    return null;
  }

  function ensureButtons() {
    if (!document.body) return;
    if (document.getElementById('bf-custom-ticket-buttons')) return;

    const existingTab = document.getElementById('bf-dock-toggle-tab');
    if (existingTab) {
      try { existingTab.remove(); } catch (e) { }
    }

    const container = document.createElement('div');
    container.id = 'bf-custom-ticket-buttons';

    // Position fixed at the bottom corner of the page
    container.style.position = 'fixed';
    container.style.bottom = '20px';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '6px';
    container.style.zIndex = '2147483645';
    container.style.transition = 'left 0.25s ease, right 0.25s ease, opacity 0.2s ease';

    // Header row with Reset button, side toggle button, and collapse button
    const headerRow = document.createElement('div');
    headerRow.style.display = 'flex';
    headerRow.style.width = '100%';
    headerRow.style.marginBottom = '2px';
    headerRow.style.gap = '4px';
    headerRow.style.alignItems = 'center';
    headerRow.style.justifyContent = 'space-between';

    // Reset button (unstick tool, menus, automations)
    const resetBtn = document.createElement('button');
    resetBtn.id = 'bf-reset-tool-btn';
    resetBtn.setAttribute('type', 'button');
    resetBtn.innerHTML = '&#8635; Reset'; // ↻ Reset
    resetBtn.title = 'Reset tool & clear active automations';
    resetBtn.style.padding = '3px 7px';
    resetBtn.style.border = 'none';
    resetBtn.style.borderRadius = '4px';
    resetBtn.style.backgroundColor = '#4b5563';
    resetBtn.style.color = '#ffffff';
    resetBtn.style.fontSize = '11px';
    resetBtn.style.fontWeight = 'bold';
    resetBtn.style.cursor = 'pointer';
    resetBtn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
    resetBtn.style.transition = 'background-color 0.2s, transform 0.1s';
    resetBtn.style.lineHeight = '1.2';
    resetBtn.style.whiteSpace = 'nowrap';
    resetBtn.style.flexShrink = '0';

    resetBtn.addEventListener('mouseenter', () => {
      resetBtn.style.backgroundColor = '#dc2626';
    });
    resetBtn.addEventListener('mouseleave', () => {
      resetBtn.style.backgroundColor = '#4b5563';
    });
    resetBtn.addEventListener('mousedown', () => {
      resetBtn.style.transform = 'scale(0.93)';
    });
    resetBtn.addEventListener('mouseup', () => {
      resetBtn.style.transform = 'scale(1)';
    });
    resetBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      resetExtensionTool();
    });

    // Settings button (gear) — agent picks default Team once, tool always uses it
    const settingsBtn = document.createElement('button');
    settingsBtn.id = 'bf-settings-btn';
    settingsBtn.setAttribute('type', 'button');
    settingsBtn.innerHTML = '&#9881;';
    settingsBtn.title = 'Tool settings (Team)';
    settingsBtn.style.padding = '3px 7px';
    settingsBtn.style.border = 'none';
    settingsBtn.style.borderRadius = '4px';
    settingsBtn.style.backgroundColor = '#4b5563';
    settingsBtn.style.color = '#ffffff';
    settingsBtn.style.fontSize = '11px';
    settingsBtn.style.fontWeight = 'bold';
    settingsBtn.style.cursor = 'pointer';
    settingsBtn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
    settingsBtn.style.lineHeight = '1.2';
    settingsBtn.style.whiteSpace = 'nowrap';
    settingsBtn.style.flexShrink = '0';
    settingsBtn.addEventListener('mouseenter', () => {
      settingsBtn.style.backgroundColor = '#2563eb';
    });
    settingsBtn.addEventListener('mouseleave', () => {
      settingsBtn.style.backgroundColor = '#4b5563';
    });
    const toggleSettingsPanel = () => {
      let panel = document.getElementById('bf-settings-panel');
      if (panel) {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        return;
      }
      panel = document.createElement('div');
      panel.id = 'bf-settings-panel';
      panel.style.cssText = 'position:fixed!important;bottom:120px!important;right:28px!important;z-index:2147483647!important;background:#111827!important;color:#fff!important;border:1px solid #374151!important;border-radius:10px!important;padding:14px!important;width:250px!important;box-shadow:0 6px 20px rgba(0,0,0,.5)!important;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif!important;';
      const title = document.createElement('div');
      title.textContent = 'Tool Settings';
      title.style.cssText = 'font-weight:bold!important;font-size:13px!important;margin-bottom:10px!important;';
      const teamLbl = document.createElement('div');
      teamLbl.textContent = 'Default Team';
      teamLbl.style.cssText = 'font-size:11px!important;opacity:.8!important;margin-bottom:4px!important;';
      const teamInput = document.createElement('select');
      teamInput.id = 'bf-settings-team-input';
      const TEAM_OPTIONS = ['cx rating restaurant', 'cx riders support', 'cx - restaurants', 'cx retention restaurant'];
      let curTeam = 'cx rating restaurant';
      try { curTeam = getDefaultTeam(); } catch (e) {}
      TEAM_OPTIONS.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        if (opt === curTeam) o.selected = true;
        teamInput.appendChild(o);
      });
      teamInput.style.cssText = 'width:100%!important;box-sizing:border-box!important;background:#1f2937!important;color:#fff!important;border:1px solid #4b5563!important;border-radius:6px!important;padding:7px 9px!important;font-size:12px!important;margin-bottom:10px!important;';
      const saveBtn = document.createElement('button');
      saveBtn.textContent = 'Save';
      saveBtn.style.cssText = 'width:100%!important;background:#2563eb!important;color:#fff!important;border:none!important;border-radius:6px!important;padding:7px!important;font-size:12px!important;font-weight:bold!important;cursor:pointer!important;';
      saveBtn.addEventListener('click', () => {
        const v = (teamInput.value || '').trim();
        if (!v) { showToast('Type a team name first.', 'error'); return; }
        try { localStorage.setItem('bf_default_team', v); } catch (e) {}
        showToast(`Default Team saved: ${v}`, 'success');
        panel.style.display = 'none';
      });
      panel.appendChild(title);
      panel.appendChild(teamLbl);
      panel.appendChild(teamInput);
      panel.appendChild(saveBtn);
      document.body.appendChild(panel);
    };
    settingsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSettingsPanel();
    });

    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'bf-toggle-pos-btn';
    toggleBtn.setAttribute('type', 'button');
    toggleBtn.style.padding = '3px 7px';
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
    toggleBtn.style.flexShrink = '0';

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

    // Collapse button on the toolbar header
    const collapseBtn = document.createElement('button');
    collapseBtn.id = 'bf-collapse-tool-btn';
    collapseBtn.setAttribute('type', 'button');
    collapseBtn.style.padding = '3px 7px';
    collapseBtn.style.border = 'none';
    collapseBtn.style.borderRadius = '4px';
    collapseBtn.style.backgroundColor = '#4b5563';
    collapseBtn.style.color = '#ffffff';
    collapseBtn.style.fontSize = '11px';
    collapseBtn.style.fontWeight = 'bold';
    collapseBtn.style.cursor = 'pointer';
    collapseBtn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
    collapseBtn.style.transition = 'background-color 0.2s, transform 0.1s';
    collapseBtn.style.lineHeight = '1.2';
    collapseBtn.style.whiteSpace = 'nowrap';
    collapseBtn.style.flexShrink = '0';

    collapseBtn.addEventListener('mouseenter', () => {
      collapseBtn.style.backgroundColor = '#2563eb';
    });
    collapseBtn.addEventListener('mouseleave', () => {
      collapseBtn.style.backgroundColor = '#4b5563';
    });
    collapseBtn.addEventListener('mousedown', () => {
      collapseBtn.style.transform = 'scale(0.93)';
    });
    collapseBtn.addEventListener('mouseup', () => {
      collapseBtn.style.transform = 'scale(1)';
    });

    // Floating dock toggle tab on the screen edge (arrow tab)
    const dockTab = document.createElement('button');
    dockTab.id = 'bf-dock-toggle-tab';
    dockTab.setAttribute('type', 'button');
    dockTab.style.position = 'fixed';
    dockTab.style.bottom = '220px';
    dockTab.style.zIndex = '2147483646';
    dockTab.style.width = '24px';
    dockTab.style.height = '48px';
    dockTab.style.padding = '0';
    dockTab.style.margin = '0';
    dockTab.style.border = '1px solid rgba(255, 255, 255, 0.25)';
    dockTab.style.backgroundColor = '#1e293b';
    dockTab.style.color = '#ffffff';
    dockTab.style.cursor = 'pointer';
    dockTab.style.display = 'flex';
    dockTab.style.alignItems = 'center';
    dockTab.style.justifyContent = 'center';
    dockTab.style.fontSize = '13px';
    dockTab.style.lineHeight = '1';
    dockTab.style.userSelect = 'none';
    dockTab.style.outline = 'none';
    dockTab.style.transition = 'background-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease, left 0.25s ease, right 0.25s ease';

    dockTab.addEventListener('mouseenter', () => {
      dockTab.style.backgroundColor = '#2563eb';
      dockTab.style.boxShadow = currentSide === 'right'
        ? '-4px 2px 14px rgba(37, 99, 235, 0.5)'
        : '4px 2px 14px rgba(37, 99, 235, 0.5)';
      if (isCollapsed) {
        dockTab.style.transform = currentSide === 'right' ? 'translateX(-3px)' : 'translateX(3px)';
      }
    });
    dockTab.addEventListener('mouseleave', () => {
      dockTab.style.backgroundColor = '#1e293b';
      dockTab.style.boxShadow = currentSide === 'right'
        ? '-3px 2px 10px rgba(0, 0, 0, 0.35)'
        : '3px 2px 10px rgba(0, 0, 0, 0.35)';
      dockTab.style.transform = 'translateX(0)';
    });
    dockTab.addEventListener('mousedown', () => {
      dockTab.style.transform = 'scale(0.92)';
    });
    dockTab.addEventListener('mouseup', () => {
      dockTab.style.transform = isCollapsed
        ? (currentSide === 'right' ? 'translateX(-3px)' : 'translateX(3px)')
        : 'translateX(0)';
    });
    dockTab.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      applyCollapsed(!isCollapsed);
    });

    const getLeftOffset = () => {
      const sidebar = document.querySelector('nav, .app-nav-bar, .page-actions, aside, [role="navigation"]');
      if (sidebar) {
        const rect = sidebar.getBoundingClientRect();
        if (rect.left <= 10 && rect.width > 30 && rect.width < 150) {
          return `${Math.round(rect.right + 15)}px`;
        }
      }
      return '28px';
    };

    let currentSide = 'right';
    let isCollapsed = false;
    let updateTreeMenuPosition = null;
    let updateAutoFillMenuPosition = null;
    let updateSheetsMenuPosition = null;
    let updateSystemMenuPosition = null;
    let closeAllTreeMenus = null;
    let closeAllAutoFillMenus = null;
    let closeAllSheetsMenus = null;
    let closeSystemMenu = null;
    try {
      currentSide = localStorage.getItem('bf_buttons_position') || 'right';
    } catch (e) { }
    try {
      isCollapsed = localStorage.getItem('bf_buttons_collapsed') === 'true';
    } catch (e) { }

    const applyCollapsed = (collapsed) => {
      isCollapsed = !!collapsed;
      try {
        localStorage.setItem('bf_buttons_collapsed', isCollapsed ? 'true' : 'false');
      } catch (e) { }

      if (isCollapsed) {
        if (typeof closeAllTreeMenus === 'function') closeAllTreeMenus();
        if (typeof closeAllAutoFillMenus === 'function') closeAllAutoFillMenus();
        if (typeof closeAllSheetsMenus === 'function') closeAllSheetsMenus();
        if (typeof closeSystemMenu === 'function') closeSystemMenu();

        if (currentSide === 'right') {
          container.style.right = '-260px';
          container.style.left = 'auto';
          dockTab.innerHTML = '&#9664;'; // ◀
          dockTab.title = 'Show Freshdesk Tools (إظهار الأدوات)';
        } else {
          container.style.left = '-260px';
          container.style.right = 'auto';
          dockTab.innerHTML = '&#9654;'; // ▶
          dockTab.title = 'Show Freshdesk Tools (إظهار الأدوات)';
        }
        container.style.opacity = '0';
        container.style.pointerEvents = 'none';
      } else {
        if (currentSide === 'right') {
          container.style.right = '28px';
          container.style.left = 'auto';
          dockTab.innerHTML = '&#9654;'; // ▶
          dockTab.title = 'Hide Freshdesk Tools (إخفاء الأدوات)';
        } else {
          container.style.left = getLeftOffset();
          container.style.right = 'auto';
          dockTab.innerHTML = '&#9664;'; // ◀
          dockTab.title = 'Hide Freshdesk Tools (إخفاء الأدوات)';
        }
        container.style.opacity = '1';
        container.style.pointerEvents = 'auto';
      }
    };

    collapseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      applyCollapsed(true);
    });

    const applyPosition = (side) => {
      currentSide = side;
      try {
        localStorage.setItem('bf_buttons_position', side);
      } catch (e) { }

      if (side === 'left') {
        container.style.left = isCollapsed ? '-260px' : getLeftOffset();
        container.style.right = 'auto';
        toggleBtn.innerHTML = '⇄ &#9654;'; // ⇄ ▶
        toggleBtn.title = 'Move to right';
        collapseBtn.innerHTML = '&#9664;'; // ◀
        collapseBtn.title = 'Hide tools to left / إخفاء لليسار';

        dockTab.style.left = '0';
        dockTab.style.right = 'auto';
        dockTab.style.borderLeft = 'none';
        dockTab.style.borderRight = '1px solid rgba(255, 255, 255, 0.25)';
        dockTab.style.borderRadius = '0 8px 8px 0';
        dockTab.style.boxShadow = '3px 2px 10px rgba(0, 0, 0, 0.35)';
      } else {
        container.style.right = isCollapsed ? '-260px' : '28px';
        container.style.left = 'auto';
        toggleBtn.innerHTML = '&#9664; ⇄'; // ◀ ⇄
        toggleBtn.title = 'Move to left';
        collapseBtn.innerHTML = '&#9654;'; // ▶
        collapseBtn.title = 'Hide tools to right / إخفاء لليمين';

        dockTab.style.right = '0';
        dockTab.style.left = 'auto';
        dockTab.style.borderRight = 'none';
        dockTab.style.borderLeft = '1px solid rgba(255, 255, 255, 0.25)';
        dockTab.style.borderRadius = '8px 0 0 8px';
        dockTab.style.boxShadow = '-3px 2px 10px rgba(0, 0, 0, 0.35)';
      }
      headerRow.style.justifyContent = 'space-between';

      applyCollapsed(isCollapsed);

      if (typeof updateTreeMenuPosition === 'function') {
        updateTreeMenuPosition(side);
      }
      if (typeof updateAutoFillMenuPosition === 'function') {
        updateAutoFillMenuPosition(side);
      }
      if (typeof updateSheetsMenuPosition === 'function') {
        updateSheetsMenuPosition(side);
      }
      if (typeof updateSystemMenuPosition === 'function') {
        updateSystemMenuPosition(side);
      }
    };

    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const nextSide = currentSide === 'right' ? 'left' : 'right';
      applyPosition(nextSide);
    });

    applyPosition(currentSide);
    headerRow.appendChild(resetBtn);
    headerRow.appendChild(settingsBtn);
    headerRow.appendChild(toggleBtn);
    headerRow.appendChild(collapseBtn);

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
    const createBtnEl = createBtn('btn-create-ticket', isKairos ? 'Create Ticket' : 'Normal Ticket', '#2563eb');

    // Section 2: Customer & Operations (Calm Teal)
    const rmsBtn = createBtn('btn-rms-order', 'RMS', '#0d9488');
    const smsBtn = createBtn('btn-sms-dashboard', 'SMS', '#0d9488');
    smsBtn.title = 'Send SMS (Breadfast Dashboard)';
    const chatBtn = createBtn('btn-chat-search', 'Chat', '#0d9488');
    chatBtn.title = 'Open Customer Chat (Kairos Search)';

    // Section 3: Tools & Utilities (Calm Violet)
    const delayBtn = createBtn('btn-delay-calc', 'Delay', '#7c3aed');
    delayBtn.title = 'Calculate Order Delay';
    const calcBtn = createBtn('btn-percentage-calc', 'Calculator', '#7c3aed');
    calcBtn.title = 'Percentage Calculator';
    const emailBtn = createBtn('btn-email-templates', 'Email', '#7c3aed');
    emailBtn.title = 'Email Templates Generator';

    // Helper to detect if an element is inside Freshdesk conversation comments/notes/threads
    const isInsideConversation = (el) => {
    if (el && el.closest && el.closest('[data-testid*="object-activity"], [data-testid*="activity-head"], [data-testid*="activity-toggle"]')) {
      return false;
    }
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

    // =========================================================================
    // Resilient Ticket State Cache & Extraction Engine (Survives Scroll & SPA)
    // =========================================================================
    const getCurrentTicketId = () => {
      // Kairos: /app/accounts/1/tickets/team/<teamId>/conversations/<convId>
      // The CONVERSATION id (LAST numeric segment) identifies the ticket —
      // never the team id. matchAll + take the last occurrence.
      try {
        const convAll = [...window.location.pathname.matchAll(/conversations\/(\d+)/gi)];
        if (convAll.length) return convAll[convAll.length - 1][1];
      } catch (e) {}
      const kairosMatch = window.location.pathname.match(/\/(?:conversations|tickets|inbox)\/(?:[a-zA-Z0-9_]+\/)?(\d+)/i) ||
                         window.location.pathname.match(/\/(?:conversations|tickets|inbox)\/(\d+)/i);
      if (kairosMatch) return kairosMatch[1];
      const match = window.location.pathname.match(/\/a\/tickets\/(\d+)/);
      return match ? match[1] : (new URLSearchParams(window.location.search).get('ticket_id') || null);
    };

    // One-time migration: drop ALL old per-ticket caches (v1 + v2) and the last-tree
    // snapshot — any of them can hold another ticket's number captured during SPA
    // transitions, before the stability guards existed. Fresh settled reads rebuild them.
    try {
      if (!localStorage.getItem('bf_cache_v3_migrated')) {
        const kill = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          if ((k.indexOf('bf_order_') === 0 && k.indexOf('bf_order_v3_') !== 0)) kill.push(k);
          else if ((k.indexOf('bf_ticket_') === 0 && k.indexOf('bf_ticket_v3_') !== 0)) kill.push(k);
          else if (k === 'bf_last_tree') kill.push(k);
        }
        kill.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
        try { localStorage.setItem('bf_cache_v3_migrated', '1'); } catch (e) {}
      }
    } catch (e) {}

    // Per-ticket order cache (Kairos unmounts the Order block depending on sidepanel state,
    // so cache the number whenever it IS visible and read from cache in the modal flow)
    const readCachedTicketOrder = () => {
      try {
        const tid = getCurrentTicketId();
        if (!tid) return '';
        const c = localStorage.getItem('bf_order_v3_' + tid) || '';
        return isValidOrderNumber(c) ? c : '';
      } catch (e) { return ''; }
    };

    // Customer-name leaf inside the Properties tab (tried paths — Kairos labels vary).
    // Returns '' when the tab is closed/unmounted (never guesses from other tabs).
    function scanCustomerNameLeaf() {
      const paths = ['customer_name', 'customerName', 'contact_name', 'full_name', 'name', 'first_name'];
      for (const p of paths) {
        try {
          const leaf = document.querySelector(`[data-path="${p}"] [data-testid="object-leaf-readonly"]`);
          const t = ((leaf && leaf.textContent) || '').trim();
          if (t && t.length >= 2 && t.length <= 80 && !/\d/.test(t) && !t.includes('@')) return t;
        } catch (e) {}
        try {
          const inp = document.querySelector(`[data-path="${p}"] input`);
          const v = ((inp && (inp.value || inp.getAttribute('value'))) || '').trim();
          if (v && v.length >= 2 && v.length <= 80 && !/\d/.test(v) && !v.includes('@')) return v;
        } catch (e) {}
      }
      return '';
    }

    // Central per-ticket store: order number, customer ID, order ID, phone, customer name.
    // Refreshed on navigation + before actions; persists until you leave the ticket.
    let bfTicketStore = { ticketId: null, ts: 0, orderNumber: '', orderId: '', customerId: '', phone: '', customerName: '' };
    // Session memory of seen (ticketId -> orderNumber), even for tickets never persisted.
    // Used only to REJECT stale transitional DOM reads, never as a data source.
    let recentTicketOrders = [];
    const rememberTicketOrder = (t, o) => {
      try {
        if (!t || !o) return;
        recentTicketOrders = [{ t, o }].concat(recentTicketOrders.filter(r => r.t !== t)).slice(0, 5);
      } catch (e) {}
    };
    async function refreshTicketStore(force = false, ensureTab = true) {
      const tid = getCurrentTicketId();
      if (!tid) return bfTicketStore;
      if (!force && bfTicketStore.ticketId === tid && Date.now() - bfTicketStore.ts < 30000 &&
          (bfTicketStore.orderNumber || bfTicketStore.customerId)) return bfTicketStore;
      // Ticket changed (or first load): NEVER carry the previous ticket's in-memory
      // data forward. Load this ticket's persisted snapshot, else start empty.
      const changed = bfTicketStore.ticketId !== tid;
      // Remember the previous ticket's number BEFORE resetting, so a transitional
      // DOM still showing it can be recognized and rejected below.
      try { rememberTicketOrder(bfTicketStore.ticketId, bfTicketStore.orderNumber); } catch (e) {}
      try {
        const saved = JSON.parse(localStorage.getItem('bf_ticket_v3_' + tid) || 'null');
        if (saved) {
          bfTicketStore = { ticketId: tid, ts: 0, orderNumber: '', orderId: '', customerId: '', phone: '', customerName: '', ...saved };
        } else if (changed) {
          bfTicketStore = { ticketId: tid, ts: 0, orderNumber: '', orderId: '', customerId: '', phone: '', customerName: '' };
        } else {
          bfTicketStore.ticketId = tid;
        }
      } catch (e) {
        if (changed) bfTicketStore = { ticketId: tid, ts: 0, orderNumber: '', orderId: '', customerId: '', phone: '', customerName: '' };
      }
      // Stale-DOM guard: order numbers are unique per ticket. A live read matching
      // ANOTHER ticket's cached number means the sidepanel still shows the previous
      // ticket (SPA transition) — reject the whole snapshot and retry.
      const otherKnownOrders = () => {
        const set = new Set();
        try {
          recentTicketOrders.forEach(r => { if (r.t !== tid && r.o) set.add(r.o); });
        } catch (e) {}
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.indexOf('bf_ticket_v3_') === 0 && k !== 'bf_ticket_v3_' + tid) {
              try {
                const j = JSON.parse(localStorage.getItem(k) || 'null');
                if (j && j.orderNumber) set.add(j.orderNumber);
              } catch (e2) {}
            }
          }
        } catch (e) {}
        return set;
      };
      const staleSet = otherKnownOrders();
      // ensure Properties tab is open so the Order block renders (only when we still lack data)
      try {
        const hasOrder = !!document.querySelector('[data-path="number"] input');
        if (ensureTab && !hasOrder && !bfTicketStore.orderNumber) {
          let propTab = document.querySelector('button[data-testid="conversation-sidepanel-tab-properties"]');
          if (!propTab) {
            // fallback: match tab by visible text (testid may change)
            propTab = Array.from(document.querySelectorAll('button[data-testid*="sidepanel-tab"], [role="tab"]'))
              .find(b => /^\s*properties\s*$/i.test((b.textContent || '').trim()));
          }
          if (propTab && propTab.getAttribute('aria-pressed') !== 'true') {
            try { propTab.click(); } catch (e) {}
          }
          const t0 = Date.now();
          while (Date.now() - t0 < 3000) {
            if (document.querySelector('[data-path="number"] input')) break;
            await new Promise(r => setTimeout(r, 80));
          }
        }
      } catch (e) {}
      const leafVal = (path) => {
        try {
          const el = document.querySelector(`[data-path="${path}"] [data-testid="object-leaf-readonly"]`);
          return el ? (el.textContent || '').trim() : '';
        } catch (e) { return ''; }
      };
      let phoneLive = '';
      try {
        const tels = Array.from(document.querySelectorAll('a[href^="tel:"]'))
          .filter(el => !el.closest('#bf-custom-ticket-buttons, #bf-continue-tree-btn, #bf-settings-panel, [data-testid="compose-form"], #bf-email-modal'));
        const tel = tels[0];
        phoneLive = tel ? ((tel.getAttribute('href') || '').replace(/^tel:/i, '').trim() || (tel.textContent || '').trim()) : '';
      } catch (e) {}
      // Settled snapshot: when this ticket has no cached order yet, poll the DOM
      // until the order value is STABLE and not another ticket's number.
      // (Right after SPA navigation the sidepanel can show the previous ticket.)
      let liveOrder = '';
      let snapshotTrusted = true;
      if (!bfTicketStore.orderNumber) {
        let prev = null;
        let sawStale = false;
        const t1 = Date.now();
        while (Date.now() - t1 < 2500) {
          try { if (getCurrentTicketId() !== tid) { snapshotTrusted = false; break; } } catch (e) {}
          let cur = '';
          try { cur = extractOrderNumber() || ''; } catch (e) {}
          if (cur && staleSet.has(cur)) {
            sawStale = true;
            prev = null;
            await new Promise(r => setTimeout(r, 400));
            continue;
          }
          if (cur && cur === prev) { liveOrder = cur; break; }
          prev = cur || null;
          if (!cur) { try { cur = readCachedTicketOrder(); } catch (e) {} }
          if (cur && !staleSet.has(cur) && cur === prev) { liveOrder = cur; break; }
          if (cur && !staleSet.has(cur)) prev = cur;
          await new Promise(r => setTimeout(r, 400));
        }
        if (!liveOrder && prev && !staleSet.has(prev)) liveOrder = prev;
        if (sawStale && !liveOrder) snapshotTrusted = false;
      } else {
        try { liveOrder = extractOrderNumber() || ''; } catch (e) {}
        if (liveOrder) {
          try {
            if (staleSet.has(liveOrder) && liveOrder !== bfTicketStore.orderNumber) liveOrder = '';
          } catch (e) {}
        }
        if (!liveOrder) { try { liveOrder = readCachedTicketOrder(); } catch (e) {} }
      }
      // Self-healing: the sidebar Order block is Kairos's own live render for the
      // CURRENT view. If it shows a valid number that is NOT another ticket's,
      // it beats any cached value (heals a stuck/poisoned cache on the next click).
      let sidebarOrder = '';
      try { sidebarOrder = findSidebarOrderNumber() || ''; } catch (e) {}
      if (sidebarOrder && !isValidOrderNumber(sidebarOrder)) sidebarOrder = '';
      if (sidebarOrder && staleSet.has(sidebarOrder) && sidebarOrder !== bfTicketStore.orderNumber) {
        console.log('[BF Kairos] Sidebar order rejected as transitional:', sidebarOrder);
        sidebarOrder = '';
      }
      const data = {
        ticketId: tid,
        ts: Date.now(),
        // Priority: live sidebar render (self-healing) > this ticket's cache > other live reads.
        // A cached value is only trusted when the sidebar is unmounted or agrees.
        orderNumber: sidebarOrder || bfTicketStore.orderNumber || liveOrder || '',
        // Live leaves/phone are accepted only from a trusted (non-transitional) snapshot.
        // bfTicketStore.* here is this ticket's own persisted data, always safe.
        orderId: bfTicketStore.orderId || (snapshotTrusted ? leafVal('id') : '') || '',
        customerId: bfTicketStore.customerId || (snapshotTrusted ? leafVal('customer_id') : '') || '',
        phone: bfTicketStore.phone || (snapshotTrusted ? phoneLive : '') || '',
        customerName: bfTicketStore.customerName || (snapshotTrusted ? scanCustomerNameLeaf() : '') || ''
      };
      bfTicketStore = data;
      try { rememberTicketOrder(tid, data.orderNumber); } catch (e) {}
      try { localStorage.setItem('bf_ticket_v3_' + tid, JSON.stringify(data)); } catch (e) {}
      return data;
    }

    const ticketDataCache = {
      ticketId: null,
      orderNumber: null,
      orderLink: null,
      customerId: null,
      customerName: null,
      customerEmail: null,
      customerPhone: null,
      contactId: null,
      deliveryBy: null
    };

    const resetTicketCache = (newId = null) => {
      ticketDataCache.ticketId = newId;
      ticketDataCache.orderNumber = null;
      ticketDataCache.orderLink = null;
      ticketDataCache.customerId = null;
      ticketDataCache.customerName = null;
      ticketDataCache.customerEmail = null;
      ticketDataCache.customerPhone = null;
      ticketDataCache.contactId = null;
      ticketDataCache.deliveryBy = null;
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

      // 4. Cached customer ID fallback
      if (ticketDataCache.customerId) {
        return ticketDataCache.customerId;
      }

      return null;
    }

    function scanCustomerInfoFromDom() {
      let name = '';
      let email = '';
      let nameSrc = '';

      // KAIROS: name/email live in the contact sidepanel (Freshdesk selectors don't exist here)
      if (isKairos) {
        // The agent's own name (saved from the Email modal) must never be mistaken for the customer.
        let agentNameNorm = '';
        try { agentNameNorm = (localStorage.getItem('bf_agent_name') || '').trim().toLowerCase(); } catch (e) {}
        const isAgentName = (t) => {
          const n = (t || '').trim().toLowerCase();
          if (!n || !agentNameNorm) return false;
          return n === agentNameNorm || (agentNameNorm.length > 3 && n.includes(agentNameNorm));
        };
        try {
          // Shared helpers (used by every pass below).
          const generic = /^(tickets?|contacts?|conversations?|inbox|search|available|online|offline|notifications?|teams?|none|unassigned|agent|assignee|not available|n\/a|na|unknown|no name)$/i;
          const orgWords = /\b(team|queue|inbox|rating|restaurant|breadfast|support|sales|triage|department|group|channel|via)\b/i;
          const looksName = (t) => t && t.length >= 3 && t.length <= 60 && !/\d/.test(t) && !t.includes('@') &&
            /^[A-Za-z\u0600-\u06FF][A-Za-z\u0600-\u06FF\s.'-]*$/.test(t) &&
            !generic.test(t) && !orgWords.test(t) && !t.toLowerCase().includes('contact') &&
            !t.toLowerCase().includes('available');
          const badEl = (el) => !el || el.closest('#bf-custom-ticket-buttons, #bf-continue-tree-btn, #bf-settings-panel, [data-testid="compose-form"], #bf-email-modal') || isInsideAgent(el) || isInsideConversation(el);
          const agentCtx = (el) => /\b(agent|assignee|assigned to)\b/i.test((el && el.textContent) || '');
          const ourUI = '#bf-custom-ticket-buttons, #bf-continue-tree-btn, #bf-settings-panel, [data-testid="compose-form"], #bf-email-modal';
          // -1. Explicit "Customer Name:" label inside the ticket itself (most explicit source).
          // Message bodies render as plain <p>/prose divs (no testids), so include them.
          // Prefers the SHORTEST container holding the label (the exact paragraph).
          const labeledName = () => {
            try {
              const convoEls = document.querySelectorAll('p, article, div[class*="prose"], [class*="bubble"], [data-testid*="activity"], [data-testid*="conversation"], [data-testid*="message"], [data-testid*="timeline"], .ticket-description, [data-testid*="description"]');
              let bestName = '';
              let bestLen = Infinity;
              for (const el of convoEls) {
                if (el.closest(ourUI)) continue;
                const full = el.textContent || '';
                if (!full || full.length > 8000) continue;
                const m = full.match(/Customer\s*Name\s*:\s*([^\n\r@]{3,60})/i);
                if (m) {
                  const cand = m[1].trim().split('\n')[0].trim();
                  if (looksName(cand) && !isAgentName(cand) && full.length < bestLen) {
                    bestLen = full.length;
                    bestName = cand;
                  }
                }
              }
              return bestName;
            } catch (e2) {}
            return '';
          };
          // -0. Phone-anchored: the name sits next to the customer phone in the contact
          // card — works even when the email is "Not Available" (no mailto link).
          const phoneAnchoredName = () => {
            const tels = Array.from(document.querySelectorAll('a[href^="tel:"]')).filter(a => !a.closest(ourUI));
            for (const tl of tels.slice(0, 3)) {
              let p = tl.parentElement;
              for (let d = 0; d < 7 && p && p !== document.body; d++) {
                if ((p.textContent || '').length > 800) { p = p.parentElement; continue; }
                if (agentCtx(p)) break; // agent card — try the next phone
                const cands = p.querySelectorAll('h1, h2, h3, h4, h5, span, div, p');
                for (const el of cands) {
                  if (el.children.length !== 0 || badEl(el)) continue;
                  let t = (el.textContent || '').trim();
                  if (!t || /\d/.test(t)) continue; // skip phone/id/avatar lines
                  const dm = t.replace(/\s+/g, ' ').match(/^(.{3,40}) \1$/);
                  if (dm) t = dm[1];
                  if (looksName(t) && !isAgentName(t)) return t;
                }
                p = p.parentElement;
              }
            }
            return '';
          };
          try { if (!name) { const v = labeledName(); if (v) { name = v; nameSrc = 'label'; } } } catch (e2) {}
          try { if (!name) { const v = phoneAnchoredName(); if (v) { name = v; nameSrc = 'phone-card'; } } } catch (e2) {}
          // Card-scoped passes: locate the contact card (small container around a phone
          // or email link, never an agent card) and search ONLY inside it. Nothing
          // outside the card is ever guessed — a stray name elsewhere ("دينا") can't leak in.
          const locateCard = () => {
            const links = Array.from(document.querySelectorAll('a[href^="tel:"], a[href^="mailto:"]'))
              .filter(a => !a.closest(ourUI) && !isInsideConversation(a));
            for (const ln of links.slice(0, 5)) {
              let p = ln.parentElement;
              for (let d = 0; d < 8 && p && p !== document.body; d++) {
                const len = (p.textContent || '').length;
                if (len < 10 || len > 800) { p = p.parentElement; continue; }
                if (agentCtx(p)) break; // agent card — try the next link
                return p;
              }
            }
            return null;
          };
          try {
            const card = locateCard();
            if (card) {
              // 1. heading-style elements first
              if (!name) {
                const headings = card.querySelectorAll('h1, h2, h3, h4, h5, div[class*="text-base"], div[class*="font-semibold"], span[class*="font-semibold"], div[class*="font-medium"]');
                for (const el of headings) {
                  if (badEl(el)) continue;
                  const t = (el.textContent || '').trim();
                  if (looksName(t) && !isAgentName(t)) { name = t; nameSrc = 'card-heading'; break; }
                }
              }
              // 2. doubled container ("Nourhan Ashraf Nourhan Ashraf" -> "Nourhan Ashraf")
              if (!name) {
                const divs = card.querySelectorAll('div, span, p');
                for (const el of divs) {
                  if (badEl(el)) continue;
                  const t = (el.textContent || '').trim().replace(/\s+/g, ' ');
                  const m = t.match(/^(.{3,40}) \1$/);
                  if (m && looksName(m[1]) && !isAgentName(m[1])) { name = m[1]; nameSrc = 'card-doubled'; break; }
                }
              }
              // 3. any plain leaf node inside the card only
              if (!name) {
                const leafs = card.querySelectorAll('h1, h2, h3, h4, h5, span, div, p');
                for (const el of leafs) {
                  if (el.children.length !== 0 || badEl(el)) continue;
                  const t = (el.textContent || '').trim();
                  if (/\d/.test(t)) continue; // skip phone/id lines
                  if (looksName(t) && !isAgentName(t)) { name = t; nameSrc = 'card-leaf'; break; }
                }
              }
            }
          } catch (e2) {}
        } catch (e) {}
        // 3.5. Per-ticket cached name (Properties tab may be closed — same mechanism
        // as the order number: central store + watcher cache, both keyed by ticket).
        try {
          if (!name && typeof bfTicketStore !== 'undefined' && bfTicketStore.customerName) {
            name = bfTicketStore.customerName;
            nameSrc = 'store';
          }
        } catch (e2) {}
        try {
          if (!name) {
            const tid = getCurrentTicketId();
            if (tid) {
              try {
                const saved = JSON.parse(localStorage.getItem('bf_ticket_v3_' + tid) || 'null');
                if (saved && saved.customerName) { name = saved.customerName; nameSrc = 'store-cache'; }
              } catch (e3) {}
              if (!name) {
                const cn = localStorage.getItem('bf_cname_v3_' + tid) || '';
                if (cn && cn.length >= 2 && cn.length <= 80 && !/\d/.test(cn)) { name = cn; nameSrc = 'name-cache'; }
              }
            }
          }
        } catch (e2) {}
        if (!name) {
          try {
            const headerName = document.querySelector('[data-testid*="conversation-header"] h1, [data-testid*="conversation-header"] [class*="font-semibold"], header h1');
            const t = (headerName ? headerName.textContent : '').trim();
            if (t && t.length > 2 && t.length < 80 && !/^\+?\d[\d\s\-()]*$/.test(t) && !t.includes('@') &&
                !isInsideAgent(headerName) && !isAgentName(t)) { name = t; nameSrc = 'header'; }
          } catch (e) {}
        }
        try {
          const mail = document.querySelector('a[href^="mailto:"]');
          if (mail) email = (mail.textContent || '').trim();
        } catch (e) {}
        if (name || email) {
          try { console.log('[BF Kairos] Customer info found:', JSON.stringify({ name, email, src: nameSrc })); } catch (e) {}
          return { name, email };
        }
      }

      // PRIORITY 1: Extract "Customer Name:" from ticket body/description
      const ticketBody = document.querySelector(
        '#ticket_original_request, .ticket-description, .ticket-body, ' +
        '[data-test-id*="ticket-description" i], .ticket-content, .description-content, ' +
        '.ticket-brightness-root'
      );
      if (ticketBody) {
        const bodyText = ticketBody.innerText || ticketBody.textContent || '';
        const custNameMatch = bodyText.match(/Customer\s*Name\s*:\s*(.+)/i);
        if (custNameMatch && custNameMatch[1]) {
          const extracted = custNameMatch[1].trim().split('\n')[0].trim();
          if (extracted && extracted.length > 0 && extracted.length < 80) {
            name = extracted;
          }
        }
      }

      // PRIORITY 2: Requester containers in header/sidebar
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

    function extractCustomerInfo(useCache = true) {
      const live = scanCustomerInfoFromDom();
      const curId = getCurrentTicketId();
      if (curId && ticketDataCache.ticketId === curId) {
        if (live.name) ticketDataCache.customerName = live.name;
        if (live.email) ticketDataCache.customerEmail = live.email;
      }

      if (useCache && ticketDataCache.ticketId === curId) {
        if (!live.name && ticketDataCache.customerName) live.name = ticketDataCache.customerName;
        if (!live.email && ticketDataCache.customerEmail) live.email = ticketDataCache.customerEmail;
      }

      return live;
    }

    function scanContactIdFromDom() {
      if (isKairos) return null;
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

      return null;
    }

    function extractContactId(useCache = true) {
      const live = scanContactIdFromDom();
      if (live) {
        const curId = getCurrentTicketId();
        if (curId && ticketDataCache.ticketId === curId) {
          ticketDataCache.contactId = live;
        }
        return live;
      }

      if (useCache && ticketDataCache.contactId &&
          ticketDataCache.ticketId && ticketDataCache.ticketId === getCurrentTicketId()) {
        return ticketDataCache.contactId;
      }

      return null;
    }

    function scanCustomerIdFromDom() {
      if (isKairos) {
        // 1. Properties panel leaf: [data-path="customer_id"] (most reliable)
        try {
          const leaf = document.querySelector('[data-path="customer_id"] [data-testid="object-leaf-readonly"]');
          const d0 = ((leaf && leaf.textContent) || '').replace(/[^\d]/g, '');
          if (d0.length >= 3 && d0.length <= 12) return d0;
          const leafInp = document.querySelector('[data-path="customer_id"] input');
          const v0 = ((leafInp && (leafInp.value || leafInp.getAttribute('value'))) || '').replace(/[^\d]/g, '');
          if (v0.length >= 3 && v0.length <= 12) return v0;
        } catch (e) {}
        // 2. Central store (persisted from Properties panel on earlier visits)
        try {
          if (typeof bfTicketStore !== 'undefined' && bfTicketStore.customerId) return bfTicketStore.customerId;
        } catch (e) {}
        try {
          const tid = getCurrentTicketId();
          const saved = tid && JSON.parse(localStorage.getItem('bf_ticket_v3_' + tid) || 'null');
          const dS = (saved && String(saved.customerId || '').replace(/[^\d]/g, '')) || '';
          if (dS.length >= 3 && dS.length <= 12) return dS;
        } catch (e) {}
        // 3. Links carrying customerId=/customer_id=/uid= (skip our own toolbar/modal)
        try {
          const idLinks = Array.from(document.querySelectorAll('a[href*="customerId=" i], a[href*="customer_id=" i], a[href*="uid=" i]'))
            .filter(el => !el.closest('#bf-custom-ticket-buttons, #bf-continue-tree-btn, #bf-settings-panel, [data-testid="compose-form"]'));
          for (const a of idLinks) {
            const href = a.href || a.getAttribute('href') || '';
            const m = href.match(/(?:customerId|customer_id|uid)=(\d{3,12})/i);
            if (m && m[1]) return m[1];
          }
        } catch (e) {}
        // 4. Contact sidepanel standalone numeric ID (short digit line under the phone).
        // Leaf-only + must be pure digits (phones contain +/spaces so they never match).
        try {
          const roots = Array.from(document.querySelectorAll('aside, [data-testid*="sidepanel"], [data-testid*="contact"]'));
          const scope = roots.length ? roots : [document.body];
          for (const root of scope) {
            const els = Array.from(root.querySelectorAll('span, div, p'))
              .filter(el => el.children.length === 0 &&
                !el.closest('#bf-custom-ticket-buttons, #bf-continue-tree-btn, #bf-settings-panel, [data-testid="compose-form"]'));
            for (const el of els) {
              const t = (el.textContent || '').trim();
              if (!/^\d{5,12}$/.test(t)) continue;
              // never mistake the open ticket/conversation ID for the customer ID
              try { if (t === getCurrentTicketId()) continue; } catch (e) {}
              return t;
            }
          }
        } catch (e) {}
        return null;
      }
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
      const contactId = scanContactIdFromDom();
      if (contactId) return contactId;

      return null;
    }

    function extractCustomerId(useCache = true) {
      const live = scanCustomerIdFromDom();
      if (live) {
        const curId = getCurrentTicketId();
        if (curId && ticketDataCache.ticketId === curId) {
          ticketDataCache.customerId = live;
        }
        return live;
      }

      if (useCache && ticketDataCache.customerId &&
          ticketDataCache.ticketId && ticketDataCache.ticketId === getCurrentTicketId()) {
        return ticketDataCache.customerId;
      }

      return null;
    }

    // Direct read of the sidebar Order block: label "Order number" + its input value.
    // Skips our own toolbar/modal.
    function findSidebarOrderNumber() {
      const labels = document.querySelectorAll('span, label, div');
      for (const l of labels) {
        const lt = (l.textContent || '').trim();
        // label may contain an icon child — accept if text starts with "Order number" and is short
        if (!/^order number/i.test(lt) || lt.length > 30) continue;
        if (l.closest('#bf-custom-ticket-buttons, #bf-continue-tree-btn, #bf-settings-panel, #bf-email-modal')) continue;
        // skip the modal's own (empty) Order field — we want the sidebar value
        if (l.closest('[data-testid="compose-form"]')) continue;
        let p = l.parentElement;
        for (let d = 0; d < 6 && p && p !== document.body; d++) {
          const inp = p.querySelector('input');
          if (inp && !inp.closest('[data-testid="compose-form"]')) {
            const v = (inp.value || inp.getAttribute('value') || '').trim();
            if (v) {
              const f = extractOrderPattern(v);
              if (f) return f;
            }
          }
          p = p.parentElement;
        }
      }
      return null;
    }

    function scanOrderNumberFromDom() {
      if (isKairos) {
        // 0. Direct sidebar Order block first (most reliable)
        const direct = findSidebarOrderNumber();
        if (direct) return direct;
        // 1. Sidepanel-scoped inputs only (Properties/Order blocks).
        // Never scan the activity timeline or page-wide inputs: they can mention
        // OTHER tickets' orders, which then sticks as this ticket's number.
        const scopeRoots = Array.from(document.querySelectorAll('aside, [data-testid*="sidepanel"], [data-testid*="properties"], [data-path="number"]'));
        for (const root of scopeRoots) {
          if (root.closest('#bf-custom-ticket-buttons, #bf-continue-tree-btn, #bf-settings-panel, [data-testid="compose-form"], #bf-email-modal')) continue;
          const scopedInputs = root.querySelectorAll('input, textarea');
          for (let i = 0; i < scopedInputs.length; i++) {
            if (scopedInputs[i].closest('[data-testid="compose-form"]')) continue;
            const val = scopedInputs[i].value || scopedInputs[i].getAttribute('value') || '';
            if (val && val.length >= 9 && val.includes('-')) {
              const found = extractOrderPattern(val.trim());
              if (found) return found;
            }
          }
        }
        return null;
      }
      // 1. Check document.title (Freshdesk tab title includes the order number)
      // document.title NEVER unmounts or scrolls away!
      if (document.title) {
        const found = extractOrderPattern(document.title);
        if (found) return found;
      }

      // 2. Check ticket title / subject in header & sticky header outside conversation
      const headerEls = Array.from(document.querySelectorAll(
        '.ticket-subject, [data-test-id="ticket-subject"], header h1, header h2, .ticket-header, ' +
        '.ticket-sticky-header, [data-test-id="sticky-header"], .sticky-ticket-title, .sub-header, .ticket-title'
      )).filter(el => !isInsideConversation(el));

      for (const h of headerEls) {
        const text = (h.textContent || '').trim();
        const found = extractOrderPattern(text);
        if (found) return found;
      }

      // 3. Look for order number input fields (e.g. edit mode or custom field) outside conversation
      const inputs = Array.from(document.querySelectorAll(
        'input[data-test-text-field*="order_number" i], input[name*="order_number" i], input[id*="order_number" i], [data-test-id*="cf_order_number" i] input'
      )).filter(el => !isInsideConversation(el));

      for (const input of inputs) {
        if (input && input.value) {
          const found = extractOrderPattern(input.value);
          if (found) return found;
        }
      }

      // 4. Look for order number containers in sidebar outside conversation
      const testIdEls = Array.from(document.querySelectorAll(
        '[data-test-id*="order_number" i], [data-test-id*="order_id" i], [data-test-id*="cf_order" i]'
      )).filter(el => !isInsideConversation(el));

      for (const el of testIdEls) {
        const text = (el.textContent || '').trim();
        const found = extractOrderPattern(text);
        if (found) return found;
      }

      // 5. Search sidebar labels and values specifically
      const sidebar = document.querySelector(
        '.ticket-properties, [data-test-id*="properties" i], aside, .ticket-details, #ticket-properties, .sidebar-pane'
      );
      if (sidebar) {
        const labels = Array.from(sidebar.querySelectorAll('label, .field-label, dt, .tkt-sidebar-label'));
        for (const label of labels) {
          const lText = (label.textContent || '').toLowerCase();
          if (lText.includes('order number') || lText.includes('order id') || lText.includes('order #')) {
            const container = label.closest('.field-container, .form-group, tr, div') || label.parentElement;
            if (container) {
              const cText = (container.textContent || '').trim();
              const found = extractOrderPattern(cText);
              if (found) return found;
            }
          }
        }
      }

      // 6. WooCommerce / Breadfast order link in page
      try {
        const orderLink = findOrderLink();
        if (orderLink) {
          const found = extractOrderPattern(orderLink);
          if (found) return found;
        }
      } catch (e) { }

      // 7. Initial ticket description / message header
      const firstDesc = document.querySelector('.ticket-description, article.conversation-item:first-child, [data-test-id="initial-message"]');
      if (firstDesc) {
        const txt = (firstDesc.textContent || '').trim();
        const found = extractOrderPattern(txt);
        if (found) return found;
      }

      // 8. General search in custom fields outside conversation
      const customFieldEls = Array.from(document.querySelectorAll('.ticket-fields, .custom-fields, [data-test-id*="custom-field"]'))
        .filter(el => !isInsideConversation(el));
      for (const el of customFieldEls) {
        const found = extractOrderPattern(el.textContent || '');
        if (found) return found;
      }

      return null;
    }

    function extractOrderNumber(useCache = true) {
      const live = scanOrderNumberFromDom();
      if (live && isValidOrderNumber(live)) {
        const curId = getCurrentTicketId();
        if (curId && ticketDataCache.ticketId === curId) {
          ticketDataCache.orderNumber = live;
        }
        return live;
      }

      // Cache read is ticket-guarded: never return another ticket's number
      if (useCache && ticketDataCache.orderNumber && isValidOrderNumber(ticketDataCache.orderNumber) &&
          ticketDataCache.ticketId && ticketDataCache.ticketId === getCurrentTicketId()) {
        return ticketDataCache.orderNumber;
      }

      return null;
    }

    function scanDeliveryByFromDom() {
      if (isKairos) return null;
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

    function extractDeliveryBy(useCache = true) {
      const live = scanDeliveryByFromDom();
      if (live) {
        const curId = getCurrentTicketId();
        if (curId && ticketDataCache.ticketId === curId) {
          ticketDataCache.deliveryBy = live;
        }
        return live;
      }

      if (useCache && ticketDataCache.deliveryBy &&
          ticketDataCache.ticketId && ticketDataCache.ticketId === getCurrentTicketId()) {
        return ticketDataCache.deliveryBy;
      }

      return null;
    }

    const scanAndCacheTicketData = (force = false) => {
      const curId = getCurrentTicketId();
      if (!curId) return;

      if (ticketDataCache.ticketId !== curId || force) {
        resetTicketCache(curId);
      }

      if (!ticketDataCache.orderNumber || !isValidOrderNumber(ticketDataCache.orderNumber)) {
        const o = scanOrderNumberFromDom();
        if (o && isValidOrderNumber(o)) ticketDataCache.orderNumber = o;
        else ticketDataCache.orderNumber = null;
      }
      if (!ticketDataCache.customerId) {
        const c = scanCustomerIdFromDom();
        if (c) ticketDataCache.customerId = c;
      }
      if (!ticketDataCache.customerPhone) {
        const p = scanCustomerPhoneFromDom();
        if (p) ticketDataCache.customerPhone = p;
      }
      if (!ticketDataCache.customerName || !ticketDataCache.customerEmail) {
        const info = scanCustomerInfoFromDom();
        if (info.name && !ticketDataCache.customerName) ticketDataCache.customerName = info.name;
        if (info.email && !ticketDataCache.customerEmail) ticketDataCache.customerEmail = info.email;
      }
      if (!ticketDataCache.contactId) {
        const cnt = scanContactIdFromDom();
        if (cnt) ticketDataCache.contactId = cnt;
      }
      if (!ticketDataCache.deliveryBy) {
        const del = scanDeliveryByFromDom();
        if (del) ticketDataCache.deliveryBy = del;
      }
    };

    // Auto-scan continuously & on scroll / navigation (Freshdesk only — disabled on Kairos to eliminate CPU lag)
    if (!isKairos) {
      scanAndCacheTicketData();
      setInterval(() => scanAndCacheTicketData(), 800);
      window.addEventListener('scroll', () => scanAndCacheTicketData(), { passive: true });
    } else {
      // Kairos: lightweight watcher that caches the order number whenever the Order
      // block is rendered (it unmounts when switching sidepanel tabs, so live reads fail).
      // Scoped selector + 2.5s interval = negligible CPU.
      // Stability-guarded: during SPA navigation the input can briefly show the PREVIOUS
      // ticket's number while the URL already changed — only cache when the value AND
      // the ticket id are stable across two reads 600ms apart.
      let pendingWatch = null;
      let pendingNameWatch = null;
      setInterval(() => {
        try {
          // Last conversations/<id> segment = the open ticket (never the team id).
          const mm = [...window.location.pathname.matchAll(/conversations\/(\d+)/gi)];
          if (!mm.length) { pendingWatch = null; pendingNameWatch = null; return; }
          const m = [null, mm[mm.length - 1][1]];
          // Order block (may be unmounted when Properties tab is closed — skip then).
          const inp = document.querySelector('[data-path="number"] input');
          const v = inp && ((inp.value || inp.getAttribute('value') || '').trim());
          if (!v) {
            pendingWatch = null;
          } else {
            const found = extractOrderPattern(v);
            if (!found || !isValidOrderNumber(found)) {
              pendingWatch = null;
            } else {
              const key = m[1] + '|' + found;
              if (pendingWatch && pendingWatch.key === key && Date.now() - pendingWatch.t0 >= 500) {
                try { localStorage.setItem('bf_order_v3_' + m[1], found); } catch (e) {}
                pendingWatch = null;
              } else if (!pendingWatch || pendingWatch.key !== key) {
                pendingWatch = { key, t0: Date.now() };
              }
            }
          }
          // Same stability guard for the customer-name leaf (Properties tab only).
          let nm = '';
          try { nm = scanCustomerNameLeaf(); } catch (e) {}
          if (!nm) { pendingNameWatch = null; return; }
          const nkey = m[1] + '|' + nm;
          if (pendingNameWatch && pendingNameWatch.key === nkey && Date.now() - pendingNameWatch.t0 >= 500) {
            try { localStorage.setItem('bf_cname_v3_' + m[1], nm); } catch (e) {}
            pendingNameWatch = null;
          } else if (!pendingNameWatch || pendingNameWatch.key !== nkey) {
            pendingNameWatch = { key: nkey, t0: Date.now() };
          }
        } catch (e) { pendingWatch = null; pendingNameWatch = null; }
      }, 2500);
    }
    
    const triggerNavigationUpdate = () => {
      setTimeout(() => {
        ensureButtons();
        if (!isKairos) scanAndCacheTicketData(true);
        else refreshTicketStore(true);
      }, 150);
    };

    try {
      const originalPush = history.pushState;
      if (typeof originalPush === 'function') {
        history.pushState = function (...args) {
          const res = originalPush.apply(this, args);
          triggerNavigationUpdate();
          return res;
        };
      }
      const originalReplace = history.replaceState;
      if (typeof originalReplace === 'function') {
        history.replaceState = function (...args) {
          const res = originalReplace.apply(this, args);
          triggerNavigationUpdate();
          return res;
        };
      }
    } catch (e) { }

    window.addEventListener('popstate', triggerNavigationUpdate);

    // =========================================================================
    // Auto Scroll-to-Top Helper
    // Scrolls the page & sidebar containers to the top so that ticket fields
    // (Customer ID, Order Number, UID, etc.) become visible in the DOM before
    // data extraction. Returns a promise that resolves after the scroll + a
    // short wait for Freshdesk to render the sidebar fields.
    // =========================================================================
    const scrollToTicketTop = () => {
      if (isKairos) {
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        // 0. Close any open Freshdesk dropdowns & blur active element FIRST
        //    This prevents ember-power-select dropdowns from staying stuck open
        try {
          // Close all open ember-power-select dropdown overlays
          const openDropdowns = document.querySelectorAll(
            '.ember-power-select-dropdown, .ember-basic-dropdown-content, ' +
            '.ember-power-select-options, [role="listbox"]'
          );
          openDropdowns.forEach(dd => {
            try { dd.style.display = 'none'; } catch (e) { }
            try { dd.remove(); } catch (e) { }
          });

          // Remove the open class from any triggers that are marked open
          document.querySelectorAll(
            '.ember-power-select-trigger[aria-expanded="true"], ' +
            '.ember-basic-dropdown-trigger[aria-expanded="true"]'
          ).forEach(tr => {
            try { tr.setAttribute('aria-expanded', 'false'); } catch (e) { }
          });

          // Send Escape key to dismiss any overlay/modal/dropdown
          document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true
          }));

          // Blur the currently focused element
          if (document.activeElement && document.activeElement !== document.body) {
            try { document.activeElement.blur(); } catch (e) { }
          }

          // Close extension's own flyout menus (tree, autofill, sheets, system)
          document.querySelectorAll('.bf-tree-menu, .bf-sheets-menu, .bf-system-menu').forEach(m => {
            try { m.style.display = 'none'; } catch (e) { }
          });
        } catch (e) { }

        // 1. Scroll the main window / document to top
        window.scrollTo({ top: 0, behavior: 'instant' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;

        // 2. Scroll common Freshdesk scrollable containers to top
        const scrollableSelectors = [
          '.app-main', '.page-content', '.ticket-details',
          '.sidebar-content', '#ticket-properties', '.ticket-properties',
          '[data-test-id="ticket-details"]', '[data-test-id="properties-widget"]',
          '.ticket-detail-page', '.ticket-pane', '.main-content',
          '.conversation-pane', '.ticket-body'
        ];
        scrollableSelectors.forEach(sel => {
          const els = document.querySelectorAll(sel);
          els.forEach(el => {
            try { el.scrollTop = 0; } catch (e) { }
          });
        });

        // 3. Also scroll any parent scrollable containers of the sidebar
        const sidebar = document.querySelector(
          '.ticket-properties, #ticket-properties, .sidebar-content, ' +
          '[data-test-id*="properties" i], aside'
        );
        if (sidebar) {
          let parent = sidebar.parentElement;
          let depth = 0;
          while (parent && parent !== document.body && depth < 10) {
            if (parent.scrollTop > 0) {
              try { parent.scrollTop = 0; } catch (e) { }
            }
            parent = parent.parentElement;
            depth++;
          }
        }

        // 4. Wait briefly for Freshdesk SPA to re-render visible fields, then re-scan cache
        setTimeout(() => {
          scanAndCacheTicketData();
          resolve();
        }, 40);
      });
    };

    const openTicketPage = async (btnEl, origText, extraParams = {}) => {
      btnEl.textContent = 'Creating...';

      const isSenior = origText === 'Senior Ticket';

      if (isKairos) {
        try {
          btnEl.textContent = 'Extracting...';

          // Custom click handler for Kairos modal elements
          const safeClick = (el) => {
            if (!el) return;
            try { if (typeof el.focus === 'function') el.focus(); } catch(e) {}
            
            // Temporary monkeypatch to trick Radix UI "click outside" listeners
            const origComposedPath = Event.prototype.composedPath;
            const origContains = Node.prototype.contains;
            Event.prototype.composedPath = function() {
              const path = origComposedPath.call(this);
              const modal = document.querySelector('[role="dialog"], [data-testid*="compose"]') || document.body;
              if (!path.includes(modal)) path.push(modal, document.body, document.documentElement, document, window);
              return path;
            };
            Node.prototype.contains = function(target) {
              if (this === document || this === document.body || (this.matches && this.matches('[role="dialog"], [data-testid*="compose"], #app'))) return true;
              return origContains.call(this, target);
            };

            try {
              if (window.PointerEvent) {
                el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
              }
              el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
              if (window.PointerEvent) {
                el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window }));
              }
              el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
            } catch(e) {}
            try { if (typeof el.click === 'function') el.click(); } catch(e) {}
            finally {
              Event.prototype.composedPath = origComposedPath;
              Node.prototype.contains = origContains;
            }
          };

          // Helper to find phone number in DOM
          const findPhone = () => {
            const tel = document.querySelector('a[href^="tel:"]');
            if (tel) {
              const hrefRaw = (tel.getAttribute('href') || '').replace(/^tel:/i, '').trim();
              if (hrefRaw) return hrefRaw;
              const textRaw = (tel.textContent || '').trim();
              if (textRaw) return textRaw;
            }
            // Check span titles or sidepanel spans
            const phoneEls = document.querySelectorAll('[data-testid*="sidepanel"] span, aside span, [data-testid*="contact"] span, a[href*="tel"] span');
            for (const el of phoneEls) {
              const title = (el.getAttribute('title') || '').trim();
              if (title && (/^\+?201[0125]\d{8}$/.test(title.replace(/[\s\-()]/g, '')) || /^01[0125]\d{8}$/.test(title.replace(/[\s\-()]/g, '')))) {
                return title;
              }
              const txt = (el.textContent || '').trim();
              if (txt && (/^\+?201[0125]\d{8}$/.test(txt.replace(/[\s\-()]/g, '')) || /^01[0125]\d{8}$/.test(txt.replace(/[\s\-()]/g, '')))) {
                return txt;
              }
            }
            // Fallback: search any text matching Egyptian mobile format in the contact drawer
            const contactPanel = document.querySelector('[data-testid*="contact"], aside, [class*="sidepanel"]');
            if (contactPanel) {
              const allSpans = Array.from(contactPanel.querySelectorAll('span, div, p'));
              for (const el of allSpans) {
                const t = (el.textContent || '').trim();
                const clean = t.replace(/[\s\-()]/g, '');
                if (/^\+?201[0125]\d{8}$/.test(clean) || /^01[0125]\d{8}$/.test(clean)) {
                  return t;
                }
              }
            }
            return null;
          };

          // Helper to find Customer Name in DOM
          const isGenericName = (t) => /^(tickets?|contacts?|conversations?|inbox|search|available|online|offline|notifications?|teams?|none|unassigned)$/i.test((t || '').trim()) || /^\+?\d[\d\s\-()]*$/.test((t || '').trim());
          const findCustName = () => {
            const contactPanel = document.querySelector('[data-testid*="contact"], aside, [class*="sidepanel"]');
            if (contactPanel) {
              const headings = contactPanel.querySelectorAll('h1, h2, h3, h4, h5, div[class*="text-base"], div[class*="font-semibold"], span[class*="font-semibold"], div[class*="font-medium"]');
              for (const el of headings) {
                const t = (el.textContent || '').trim();
                if (t && t.length > 2 && !isGenericName(t) && !t.toLowerCase().includes('contact') && !t.toLowerCase().includes('available')) {
                  return t;
                }
              }
            }
            const headerName = document.querySelector('[data-testid*="conversation-header"] h1, [data-testid*="conversation-header"] [class*="font-semibold"], header h1');
            if (headerName) {
              const t = headerName.textContent.trim();
              if (t && t.length > 2 && !isGenericName(t)) return t;
            }
            return null;
          };

          // Step 1: Check if phone / custName are already visible in DOM
          let phone = findPhone();
          let custName = findCustName();

          // Step 2: If phone not found, click Contact tab so the sidepanel opens
          if (!phone || !custName) {
            const contactTab = document.querySelector('button[data-testid="conversation-sidepanel-tab-contact"], [data-testid="conversation-sidepanel-tab-contact"]') ||
              Array.from(document.querySelectorAll('button[data-testid*="sidepanel-tab"]')).find(b => (b.textContent || '').toLowerCase().includes('contact'));

            if (contactTab) {
              const isPressed = contactTab.getAttribute('aria-pressed') === 'true';
              if (!isPressed) {
                showToast('Opening Contact tab to get CST details...', 'info');
                contactTab.click();
              }
            }

            // Step 3: Wait up to 2000ms for Contact panel & phone/name to appear
            const startWait = Date.now();
            while (Date.now() - startWait < 2000) {
              await new Promise(r => setTimeout(r, 80));
              if (!phone) phone = findPhone();
              if (!custName) custName = findCustName();
              if (phone && custName) break;
            }
          }

          if (phone) {
            console.log('[BF Kairos] Extracted CST phone:', phone);
            showToast(`CST Phone extracted: ${phone}`, 'success');
          } else {
            console.warn('[BF Kairos] Could not extract CST phone.');
            showToast('Could not find CST phone number.', 'warning');
          }

          if (custName) {
            console.log('[BF Kairos] Extracted CST name:', custName);
          }

          // Pre-modal: capture order number BEFORE opening the compose modal.
          // The flow above leaves the sidepanel on the Contact tab, and the modal
          // covers the UI — so resolveModalOrderNo() afterwards can't see the
          // Properties-tab Order block. Grab it here while tabs are clickable.
          let preModalOrderNo = '';
          try { preModalOrderNo = extractOrderNumber() || ''; } catch (e) {}
          if (!preModalOrderNo) { try { preModalOrderNo = readCachedTicketOrder(); } catch (e) {} }
          if (!preModalOrderNo) {
            try {
              const st = await refreshTicketStore(true);
              preModalOrderNo = (st && st.orderNumber) || '';
            } catch (e) {}
          }
          if (preModalOrderNo) console.log('[BF Kairos] Pre-modal order number:', preModalOrderNo, 'tid:', (function () { try { return getCurrentTicketId(); } catch (e) { return '?'; } })(), 'path:', window.location.pathname);

          // Step 4: Click the Kairos native New Conversation button (pen icon)
          const findNewConversationBtn = () => {
            const penIcon = document.querySelector('.i-lucide-pen-line, span[class*="pen-line"]');
            if (penIcon) {
              const b = penIcon.closest('button');
              if (b) return b;
            }
            return document.querySelector('button[title*="New Conversation" i], button[aria-label*="New Conversation" i]');
          };

          const penBtn = findNewConversationBtn();
          if (penBtn) {
            console.log('[BF Kairos] Clicking New Conversation button...', penBtn);
            penBtn.click();
          } else {
            console.warn('[BF Kairos] New Conversation (pen) button not found!');
          }

          // Step 5: Wait for the New Conversation compose modal to appear
          // Exact DOM (from inspect): [data-testid="compose-form"] > [data-testid="compose-header"] > div[data-field="contact"] > input
          const composeForm = () => document.querySelector('[data-testid="compose-form"]');
          const findToInput = () => {
            const form = composeForm();
            if (form) {
              const contactField = form.querySelector('[data-field="contact"]');
              if (contactField) {
                const inp = contactField.querySelector('input');
                if (inp) return inp;
              }
            }
            return document.querySelector('input[placeholder*="search by name, email, or phone" i], input[placeholder*="Enter at least 2 characters" i]') ||
                   document.querySelector('[data-testid*="recipient-search"] input, [data-testid*="to-input"] input');
          };

          let toInput = null;
          const waitModalStart = Date.now();
          while (Date.now() - waitModalStart < 2500) {
            await new Promise(r => setTimeout(r, 60));
            toInput = findToInput();
            if (toInput) break;
          }

          // Step 6: If phone extracted and To input found, type phone into To input
          if (phone && toInput) {
            console.log('[BF Kairos] Typing CST phone into To input:', phone);
            toInput.focus();
            await new Promise(r => setTimeout(r, 60));

            // Snapshot boxes already on screen so later we only accept the NEW results dropdown
            const boxesBefore = new Set();
            try {
              const ir0 = toInput.getBoundingClientRect();
              document.querySelectorAll('div, ul').forEach(el => {
                try {
                  const r = el.getBoundingClientRect();
                  if (r.top >= ir0.bottom - 10 && r.top <= ir0.bottom + 300 && Math.abs(r.left - ir0.left) <= 250) boxesBefore.add(el);
                } catch (e) {}
              });
            } catch (e) {}

            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            if (nativeSetter) nativeSetter.call(toInput, phone);
            else toInput.value = phone;

            toInput.dispatchEvent(new Event('input', { bubbles: true }));
            toInput.dispatchEvent(new Event('change', { bubbles: true }));

            for (let i = 0; i < phone.length; i++) {
              const ch = phone[i];
              toInput.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
              toInput.dispatchEvent(new KeyboardEvent('keypress', { key: ch, bubbles: true }));
              toInput.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }));
            }

            showToast(`CST Phone entered: ${phone}`, 'info');

            // Helper to check if Customer is committed as a chip in To field
            // Committed state: phone appears as TEXT (input gone) with a remove (x) button.
            // Strict phone-digits match only — loose matches caused false positives.
            const isCustomerSelected = () => {
              const form = composeForm();
              const contactField = form?.querySelector('[data-field="contact"]') ||
                document.querySelector('[data-testid="compose-header"] [data-field="contact"]');
              if (!contactField) return false;
              const cleanP = (phone || '').replace(/[^0-9]/g, '');
              if (cleanP.length < 8) return false;
              const hasInput = !!contactField.querySelector('input');
              const fieldDigits = (contactField.textContent || '').replace(/[^0-9]/g, '');
              if (!fieldDigits.includes(cleanP)) return false;
              if (!hasInput) return true;
              const hasX = !!contactField.querySelector('svg.lucide-x, [class*="i-lucide-x"], button[class*="flex-shrink"], [class*="chip"]');
              return hasX;
            };

            // Step 7: Wait for search result dropdown from Kairos server and click Customer
            // Results render as [role="option"] items in a listbox/popover under the compose form
            const findRecipientCard = () => {
              const cleanP = (phone || '').replace(/[^0-9]/g, '');
              const searchName = (custName || '').trim().toLowerCase();

              // 0. The NEW results dropdown that appeared AFTER typing (snapshot diff —
              //    sidebar/background elements are all in boxesBefore, so they can never match)
              const findNewResultsBox = () => {
                if (!toInput) return null;
                try {
                  const ir = toInput.getBoundingClientRect();
                  const boxes = Array.from(document.querySelectorAll('div, ul')).filter(el => {
                    if (boxesBefore.has(el)) return false;
                    if (el.closest('#bf-custom-ticket-buttons')) return false;
                    if (el.contains(toInput) || el === toInput) return false;
                    if (el.closest('[channel-type]') || el.hasAttribute?.('channel-type')) return false;
                    const t = (el.textContent || '').trim();
                    if (!t || t.length < 4 || t.length > 800) return false;
                    if (/enter at least|search by/i.test(t)) return false;
                    const r = el.getBoundingClientRect();
                    if (r.top < ir.bottom - 10 || r.top > ir.bottom + 300) return false;
                    if (Math.abs(r.left - ir.left) > 250) return false;
                    if (r.height < 30 || r.height > 340 || r.width < 100) return false;
                    return true;
                  });
                  if (!boxes.length) return null;
                  boxes.sort((a, b) => (a.getBoundingClientRect().top - b.getBoundingClientRect().top) || (a.outerHTML.length - b.outerHTML.length));
                  return boxes[0];
                } catch (e) { return null; }
              };
              {
                const box = findNewResultsBox();
                if (box) {
                  const row = box.querySelector('[role="option"], li, button, a, div.cursor-pointer') || box.firstElementChild || box;
                  return row;
                }
              }
              const matchesCustomer = (t) => {
                if (!t) return false;
                if (t.includes('Enter at least') || t.includes('search by')) return false;
                if (t.includes('@') && t.includes('.')) return true;
                if (cleanP.length > 7 && t.replace(/[^0-9]/g, '').includes(cleanP)) return true;
                if (searchName.length > 2 && t.toLowerCase().includes(searchName)) return true;
                return false;
              };

              // 0. Precise: options inside the compose form's own listbox (strict customer match first)
              const form = composeForm();
              if (form) {
                const opts = Array.from(form.querySelectorAll('[role="listbox"] [role="option"], [role="option"]'));
                const strict = opts.filter(el => {
                  const r = el.getBoundingClientRect();
                  return r.height >= 18 && r.height <= 400 && matchesCustomer((el.textContent || '').trim());
                });
                if (strict.length) {
                  strict.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
                  return strict[0];
                }
              }

              // 1. Check any popper / listbox attached to the compose modal
              const poppers = Array.from(document.querySelectorAll('[data-popover-content], [data-radix-popper-content-wrapper], [role="listbox"], [role="menu"], [id*="listbox"], [id*="radix"], div[class*="popover"], div[class*="dropdown-menu"]'));
              for (const popper of poppers) {
                if (popper.closest('aside, nav, header, #bf-custom-ticket-buttons, [data-testid*="conversation-header"]')) continue;
                if (form && !form.contains(popper) && !popper.contains(form)) {
                  // popover portals render outside the form — accept only ones near the To input
                  if (toInput) {
                    const pr = popper.getBoundingClientRect();
                    const ir = toInput.getBoundingClientRect();
                    if (Math.abs(pr.top - ir.bottom) > 300) continue;
                  }
                }
                const items = Array.from(popper.querySelectorAll('[role="option"], [role="menuitem"], button, li, div.cursor-pointer, [data-radix-collection-item]')).filter(el => {
                  if (el.closest('[channel-type]') || el.hasAttribute?.('channel-type')) return false;
                  const t = (el.textContent || '').trim();
                  return t.length > 1 && matchesCustomer(t);
                });
                if (items.length > 0) return items[0];
              }

              // 2. Search anywhere inside or near compose modal for cards matching phone or custName
              // NEVER match channel/inbox cards (e.g. [channel-type]) — customer results only
              const allCandidates = Array.from(document.querySelectorAll('div, li, button, [role="option"]')).filter(el => {
                if (el.closest('aside, nav, header, #bf-custom-ticket-buttons, [data-testid*="conversation-header"]')) return false;
                if (el.closest('[channel-type]') || el.hasAttribute?.('channel-type')) return false;
                if (el.contains(toInput) || el === toInput) return false;
                const rect = el.getBoundingClientRect();
                // Ignore elements that are too large (e.g. entire app container)
                if (rect.width > 600 || rect.height > 400 || rect.height < 18) return false;
                
                const t = (el.textContent || '').trim();
                if (!t || t.includes('Enter at least') || t.includes('search by') || t === 'Discard' || t.startsWith('Send')) return false;

                const hasEmail = t.includes('@') && t.includes('.');
                const hasPhone = cleanP.length > 7 && t.replace(/[^0-9]/g, '').includes(cleanP);
                const hasName = searchName.length > 2 && t.toLowerCase().includes(searchName);

                return hasEmail || hasPhone || hasName;
              });

              if (allCandidates.length > 0) {
                const card = allCandidates[0].closest('div[class*="h-12"], div[class*="border-b"], [role="option"], li, button') || allCandidates[0];
                return card;
              }

              // 3. Fallback: Elements physically rendered below toInput
              if (toInput) {
                const rect = toInput.getBoundingClientRect();
                const belowElements = Array.from(document.querySelectorAll('div, button, li')).filter(el => {
                  if (el.closest('aside, nav, header, #bf-custom-ticket-buttons, [data-testid*="conversation-header"]')) return false;
                  if (el.contains(toInput) || el === toInput) return false;
                  const r = el.getBoundingClientRect();
                  const isBelow = r.top >= rect.bottom - 5 && r.top <= rect.bottom + 100 && Math.abs(r.left - rect.left) < 150 && r.height >= 24;
                  const t = (el.textContent || '').trim();
                  return isBelow && t.length > 1 && !t.includes('search by') && !t.includes('Enter at least');
                });
                if (belowElements.length > 0) {
                  return belowElements[0];
                }
              }

              return null;
            };

            // FOOLPROOF selection: the extension NEVER clicks search results (synthetic clicks
            // kept hitting sidebar/background). It types the phone, then YOU click the customer name
            // with your own mouse — 100% reliable — and the extension auto-resumes with Via.
            showToast('Click the customer name below — Via will complete automatically.', 'info');

            let chipOk = isCustomerSelected();
            if (!chipOk) {
              chipOk = await new Promise((resolve) => {
                let done = false;
                const finish = (v) => {
                  if (done) return;
                  done = true;
                  try { obs.disconnect(); } catch (e) {}
                  try { clearInterval(iv); } catch (e) {}
                  resolve(v);
                };
                let obs = null;
                try {
                  obs = new MutationObserver(() => { if (isCustomerSelected()) finish(true); });
                  obs.observe(document.body, { childList: true, subtree: true });
                } catch (e) { finish(isCustomerSelected()); return; }
                const iv = setInterval(() => { if (isCustomerSelected()) finish(true); }, 400);
                setTimeout(() => finish(isCustomerSelected()), 60000);
              });
            }

            if (!chipOk) {
              console.warn('[BF Kairos] Customer was not selected (timeout).');
              showToast('Customer not selected — modal left open.', 'error');
              return;
            }
            console.log('[BF Kairos] Customer chip committed.');

            // Step 8: Select "Order Rating" under "Via:" — ONLY inside [data-testid="compose-form"]
            // (Via unlocks only after the customer chip is committed — enforced above)
            await new Promise(r => setTimeout(r, 150));

            // Anchor on compose-form testid, or on the To chip itself (testids may vanish after re-render)
            const findComposeRoot = () => {
              const form = composeForm();
              if (form) return form;
              const cleanP = (phone || '').replace(/[^0-9]/g, '');
              if (cleanP.length > 7) {
                const spans = Array.from(document.querySelectorAll('span, div'));
                for (const el of spans) {
                  if (el.children.length > 3) continue;
                  const t = (el.textContent || '');
                  if (t.replace(/[^0-9]/g, '').includes(cleanP) && /\(\+?\d/.test(t)) {
                    let p = el.parentElement;
                    for (let d = 0; d < 12 && p && p !== document.body; d++) {
                      const txt = (p.textContent || '').toLowerCase();
                      if (txt.includes('show inboxes') || txt.includes('via:') || txt.includes('order rating')) return p;
                      p = p.parentElement;
                    }
                  }
                }
              }
              return null;
            };

            const findViaTriggerInModal = () => {
              const root = findComposeRoot() || document;
              // "Show inboxes" is a SPAN inside a BUTTON in the compose form.
              // NOTE: do NOT exclude aside/nav here — the compose popover itself may live under them.
              // Scope is already precise (inside compose-form), only exclude our own toolbar.
              const cands = Array.from(root.querySelectorAll('button, [role="combobox"]')).filter(el => {
                if (el.closest('#bf-custom-ticket-buttons')) return false;
                const t = (el.textContent || '').trim().toLowerCase();
                return t === 'show inboxes' || t.includes('show inboxes');
              });
              if (cands.length) return cands[0];
              return null;
            };

            // YOU pick Via manually — the extension waits until Via is set, then fills the tree.
            showToast('Now choose Via yourself — the tree will complete automatically.', 'info');
            // Smallest element holding the "(+phone" chip text (works without testids)
            const findToChip = () => {
              const cleanP = (phone || '').replace(/[^0-9]/g, '');
              if (cleanP.length < 8) return null;
              const cands = Array.from(document.querySelectorAll('span, div, p')).filter(el => {
                if (el.closest('#bf-custom-ticket-buttons')) return false;
                const t = (el.textContent || '');
                if (!t.replace(/[^0-9]/g, '').includes(cleanP)) return false;
                if (!/\(\+?\d/.test(t)) return false;
                return true;
              });
              if (!cands.length) return null;
              cands.sort((a, b) => (a.outerHTML.length - b.outerHTML.length));
              return cands[0];
            };
            // Via value: whatever inbox chip is selected (Order Rating, Breadfast System, ...).
            // Finds the "Via:" label row and reads its value (placeholder "Show inboxes" = not set).
            const getViaValue = () => {
              const scopes = [];
              try {
                const chip = findToChip();
                if (chip) {
                  let p = chip.parentElement;
                  for (let d = 0; d < 14 && p && p !== document.body; d++) {
                    if ((p.textContent || '').toLowerCase().includes('via')) { scopes.push(p); break; }
                    p = p.parentElement;
                  }
                }
              } catch (e) {}
              try { const r = findComposeRoot() || composeForm(); if (r) scopes.push(r); } catch (e) {}
              scopes.push(document);
              for (const scope of scopes) {
                const labels = Array.from(scope.querySelectorAll('span, label, div')).filter(el => {
                  if (el.closest('#bf-custom-ticket-buttons, #bf-continue-tree-btn')) return false;
                  if (el.children.length !== 0) return false;
                  return /^(via:?)$/i.test((el.textContent || '').trim());
                });
                for (const lb of labels) {
                  const row = lb.parentElement;
                  if (!row || row.closest('#bf-custom-ticket-buttons')) continue;
                  const t = (row.textContent || '').replace(/^via:?\s*/i, '').trim();
                  if (!t || /show inboxes/i.test(t) || t.length > 80) continue;
                  return t;
                }
              }
              return null;
            };
            const isViaSet = () => !!getViaValue();
            // Manual resume button (failsafe): click it after choosing Via and the tree fills at once
            let manualGo = false;
            const resumeBtn = document.createElement('button');
            resumeBtn.id = 'bf-continue-tree-btn';
            resumeBtn.type = 'button';
            resumeBtn.textContent = '✓ Via selected — Fill Tree';
            resumeBtn.style.cssText = 'position:fixed!important;bottom:80px!important;right:28px!important;z-index:2147483647!important;background:#16a34a!important;color:#fff!important;border:none!important;border-radius:8px!important;padding:12px 18px!important;font-size:14px!important;font-weight:bold!important;cursor:pointer!important;box-shadow:0 4px 14px rgba(0,0,0,.4)!important;';
            resumeBtn.addEventListener('click', () => { manualGo = true; });
            try { document.body.appendChild(resumeBtn); } catch (e) {}
            let viaOk = isViaSet();
            if (!viaOk) {
              viaOk = await new Promise((resolve) => {
                let done = false;
                const finish = (v) => {
                  if (done) return;
                  done = true;
                  try { obs.disconnect(); } catch (e) {}
                  try { clearInterval(iv); } catch (e) {}
                  try { resumeBtn.remove(); } catch (e) {}
                  resolve(v);
                };
                let obs = null;
                try {
                  obs = new MutationObserver(() => { if (manualGo || isViaSet()) finish(true); });
                  obs.observe(document.body, { childList: true, subtree: true, characterData: true });
                } catch (e) { finish(isViaSet()); return; }
                const iv = setInterval(() => { if (manualGo || isViaSet()) finish(true); }, 400);
                setTimeout(() => finish(isViaSet()), 60000);
              });
            } else {
              try { resumeBtn.remove(); } catch (e) {}
            }
            if (!viaOk) {
              console.warn('[BF Kairos] Via was not selected (timeout) — leaving modal open.');
              showToast('Via not selected — modal left open.', 'error');
              return;
            }
            console.log('[BF Kairos] Via is set, filling tree...');
            {
              // Tree menu → full tree fill; Normal/Senior without tree → basics
              // (BU, Status, Team, Order, Subject=order). Senior adds description template.
              const treeDone = await fillKairosComposeTree();
              if (treeDone) {
                if (isSenior) await fillSeniorDescription();
                showToast('Ticket completed: customer, Via & tree filled!', 'success');
              } else {
                const basicsDone = await fillKairosComposeBasics();
                if (isSenior) await fillSeniorDescription();
                if (basicsDone) showToast('Ticket basics filled (no tree)!', 'success');
                else showToast('Customer & Via selected! (complete manually.)', 'success');
              }
            }

            // Shared modal helpers: resolve + type order number, set subject, wait triggers.
            async function waitModalTriggerShared(field, ms = 2500) {
              const t0 = Date.now();
              let tr = null;
              while (Date.now() - t0 < ms) {
                tr = findDropdownTrigger(field);
                if (tr && document.body.contains(tr)) return tr;
                await new Promise(r => setTimeout(r, 60));
              }
              return findDropdownTrigger(field);
            }
            async function resolveModalOrderNo() {
              // preModal capture is fresher (taken right before the modal opened);
              // extraParams may carry a stale number captured earlier at menu-click time.
              let orderNo = '';
              try { if (typeof preModalOrderNo !== 'undefined' && preModalOrderNo) orderNo = preModalOrderNo; } catch (e) {}
              if (!orderNo) orderNo = extraParams.bf_order_number || '';
              let lastNo = '';
              try {
                const lj = JSON.parse(localStorage.getItem('bf_last_tree') || 'null');
                const curTid2 = getCurrentTicketId() || '';
                if (lj && lj.orderNumber && lj.ticketId && curTid2 && lj.ticketId === curTid2) {
                  lastNo = lj.orderNumber;
                } else if (lj && lj.orderNumber) {
                  console.log('[BF Kairos] Ignoring last-tree order (different ticket).');
                }
              } catch (e) {}
              if (!orderNo) orderNo = lastNo;
              let liveNo = '';
              try { liveNo = extractOrderNumber() || ''; } catch (e) {}
              if (!liveNo) { try { liveNo = readCachedTicketOrder(); } catch (e) {} }
              // ensureTab=true: opens the Properties tab so the Order block renders
              // (sidepanel is usually left on Contact tab by the phone-extraction step).
              if (!liveNo) { try { const st = await refreshTicketStore(true); liveNo = (st && st.orderNumber) || ''; } catch (e) {} }
              if (!orderNo) orderNo = liveNo;
              console.log('[BF Kairos] Order sources:', JSON.stringify({ tid: (function () { try { return getCurrentTicketId(); } catch (e) { return '?'; } })(), param: extraParams.bf_order_number || '', pre: (typeof preModalOrderNo !== 'undefined' && preModalOrderNo) || '', last: lastNo, live: liveNo, final: orderNo || '(none)' }));
              if (!orderNo) {
                try {
                  const orderBlock = Array.from(document.querySelectorAll('[data-testid="object-attribute"]')).find(el =>
                    !el.closest('#bf-custom-ticket-buttons, [data-testid="compose-form"]') &&
                    /order number/i.test(el.textContent || ''));
                  const refreshBtn = orderBlock?.querySelector('[data-testid="object-attribute-refresh"]');
                  if (refreshBtn) {
                    console.log('[BF Kairos] Clicking Order Refresh to load order data...');
                    refreshBtn.click();
                    await new Promise(r => setTimeout(r, 1200));
                    try { orderNo = extractOrderNumber(true) || ''; } catch (e) {}
                    if (orderNo) console.log('[BF Kairos] Order number after refresh:', orderNo);
                  }
                } catch (e) {}
              }
              return orderNo;
            }
            async function typeModalOrderNo(orderNo) {
              try {
                const form = composeForm();
                const orderInput = form?.querySelector('[data-field*="order" i] input, [data-testid*="order" i] input') ||
                  (() => {
                    const lbls = Array.from(document.querySelectorAll('span, label'));
                    for (const l of lbls) {
                      if (/^order number$/i.test((l.textContent || '').trim())) {
                        let p = l.parentElement;
                        for (let d = 0; d < 4 && p && p !== document.body; d++) {
                          const inp = p.querySelector('input');
                          if (inp) return inp;
                          p = p.parentElement;
                        }
                      }
                    }
                    return null;
                  })();
                if (orderInput && !orderInput.disabled && orderInput.value !== orderNo) {
                  const oSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                  if (oSetter) oSetter.call(orderInput, orderNo);
                  else orderInput.value = orderNo;
                  orderInput.dispatchEvent(new Event('input', { bubbles: true }));
                  orderInput.dispatchEvent(new Event('change', { bubbles: true }));
                  orderInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                  orderInput.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                  orderInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                  console.log('[BF Kairos] Modal Order number set:', orderNo);
                  showToast(`Modal Order number set: ${orderNo}`, 'info');
                  await new Promise(r => setTimeout(r, 800));
                  return true;
                }
              } catch (e) { console.warn('[BF Kairos] Order number set failed:', e); }
              return false;
            }
            function setModalSubject(subjVal) {
              try {
                if (!subjVal) return false;
                const form = composeForm();
                const subjInput = form?.querySelector('[data-field="subject"] input, [data-field="subject"] textarea') || findSubjectInput();
                if (subjInput && !subjInput.disabled && subjInput.value !== subjVal) {
                  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                  if (setter && subjInput.tagName === 'INPUT') setter.call(subjInput, subjVal);
                  else subjInput.value = subjVal;
                  subjInput.dispatchEvent(new Event('input', { bubbles: true }));
                  subjInput.dispatchEvent(new Event('change', { bubbles: true }));
                  console.log('[BF Kairos] Modal Subject set:', subjVal);
                  return true;
                }
              } catch (e) { console.warn('[BF Kairos] Subject set failed:', e); }
              return false;
            }
            // Normal ticket without tree: BU + Status + Team + Order + Subject(=order).
            async function fillKairosComposeBasics() {
              const buTr = await waitModalTriggerShared('Business unit');
              if (buTr && !isDropdownSelected(buTr, 'Food Aggregation')) {
                console.log('[BF Kairos] Setting modal Business unit: Food Aggregation...');
                await assertDropdown('Business unit', 'Food Aggregation', 3000);
                await new Promise(r => setTimeout(r, 150));
              }
              const stTr = await waitModalTriggerShared('Status');
              if (stTr && !isDropdownSelected(stTr, 'Open')) {
                console.log('[BF Kairos] Setting modal Status: Open...');
                await assertDropdown('Status', 'Open', 3000);
                await new Promise(r => setTimeout(r, 150));
              }
              const confTeam = getDefaultTeam();
              const teamTr = await waitModalTriggerShared('Team');
              if (teamTr && !isDropdownSelected(teamTr, confTeam)) {
                console.log('[BF Kairos] Setting modal Team:', confTeam);
                await assertDropdown('Team', confTeam, 3000);
                await new Promise(r => setTimeout(r, 150));
              }
              const orderNo = await resolveModalOrderNo();
              if (orderNo) {
                await typeModalOrderNo(orderNo);
                setModalSubject('XX - ' + orderNo);
              } else {
                console.log('[BF Kairos] No order number found for modal.');
              }
              return true;
            }
            // Senior description template (only fills an empty message editor).
            // Senior description template (only fills an empty message editor).
            async function fillSeniorDescription() {
              const tpl = 'Amount: \nReason: \nSwitcher: \nOrder Link: \nItem Name: \nAccountability: Breadfast Restaurant';
              try {
                const scope = findComposeRoot() || composeForm();
                if (!scope) { console.log('[BF Kairos] No compose scope for description.'); return false; }
                const editable = scope.querySelector('.ProseMirror[contenteditable="true"]') ||
                  scope.querySelector('[contenteditable="true"]');
                if (editable) {
                  if ((editable.textContent || '').trim()) {
                    console.log('[BF Kairos] Description not empty — senior template skipped.');
                    return true;
                  }
                  try { editable.focus(); } catch (e) {}
                  let inserted = false;
                  try { inserted = document.execCommand('insertText', false, tpl); } catch (e) {}
                  if (!inserted) {
                    editable.textContent = tpl;
                    try { editable.dispatchEvent(new InputEvent('input', { bubbles: true, data: tpl })); }
                    catch (e) { editable.dispatchEvent(new Event('input', { bubbles: true })); }
                  }
                  console.log('[BF Kairos] Senior description template set.');
                  return true;
                }
                const ta = scope.querySelector('textarea');
                if (ta && !ta.disabled && !(ta.value || '').trim()) {
                  ta.value = tpl;
                  ta.dispatchEvent(new Event('input', { bubbles: true }));
                  ta.dispatchEvent(new Event('change', { bubbles: true }));
                  console.log('[BF Kairos] Senior description template set (textarea).');
                  return true;
                }
                console.log('[BF Kairos] No description editor found.');
              } catch (e) { console.warn('[BF Kairos] Senior description failed:', e); }
              return false;
            }

            // Fill Subject / Team / Type / cascade inside the open compose modal from Tree-menu params.
            // No-ops (returns false) when Create Ticket was pressed directly without a tree.
            async function fillKairosComposeTree() {
              let tType = extraParams.bf_tree_type || '';
              let tCat = extraParams.bf_category || '';
              let tDet = extraParams.bf_detail || '';
              let tSub = extraParams.bf_sub_detail || '';
              // Direct press (Normal/Senior buttons) carries no tree: NEVER reuse a stale
              // last tree here — that would set a wrong Type/cascade. Basics flow handles it.
              if (!tType && !tCat && !tDet && !tSub) return false;
              const low = (tType || '').toLowerCase();
              const isComplain = low.includes('complain');
              const isFeedback = low.includes('feedback');

              // Ticket changed? Force a fresh read from Properties (opens the tab itself if needed)
              // so we never use the previous ticket's number.
              try {
                const curTid = getCurrentTicketId() || '';
                if (curTid && bfTicketStore.ticketId !== curTid) {
                  console.log('[BF Kairos] Ticket changed — refreshing store from Properties...');
                  await refreshTicketStore(true);
                }
              } catch (e) {}

              // Order number FIRST: typing it + Enter fetches from Breadfast App and re-renders
              // the form — doing it later would wipe the tree selections. Settle 800ms after.
              // Source: pre-modal capture (freshest) > tree params > last tree (SAME ticket only) > ticket store > live scan > refresh retry.
              let orderNo = '';
              try { if (typeof preModalOrderNo !== 'undefined' && preModalOrderNo) orderNo = preModalOrderNo; } catch (e) {}
              if (!orderNo) orderNo = extraParams.bf_order_number || '';
              let lastNo = '';
              try {
                const lj = JSON.parse(localStorage.getItem('bf_last_tree') || 'null');
                const curTid2 = getCurrentTicketId() || '';
                if (lj && lj.orderNumber && lj.ticketId && curTid2 && lj.ticketId === curTid2) {
                  lastNo = lj.orderNumber;
                } else if (lj && lj.orderNumber) {
                  console.log('[BF Kairos] Ignoring last-tree order (different ticket).');
                }
              } catch (e) {}
              if (!orderNo) orderNo = lastNo;
              let liveNo = '';
              try { liveNo = extractOrderNumber() || ''; } catch (e) {}
              if (!liveNo) { try { liveNo = readCachedTicketOrder(); } catch (e) {} }
              // ensureTab=true: opens the Properties tab so the Order block renders
              // (sidepanel is usually left on Contact tab by the phone-extraction step).
              if (!liveNo) { try { const st = await refreshTicketStore(true); liveNo = (st && st.orderNumber) || ''; } catch (e) {} }
              if (!orderNo) orderNo = liveNo;
              console.log('[BF Kairos] Order sources:', JSON.stringify({ tid: (function () { try { return getCurrentTicketId(); } catch (e) { return '?'; } })(), param: extraParams.bf_order_number || '', pre: (typeof preModalOrderNo !== 'undefined' && preModalOrderNo) || '', last: lastNo, live: liveNo, final: orderNo || '(none)' }));
              // Last resort: the sidebar Order block may need Refresh to load — click it and rescan
              if (!orderNo) {
                try {
                  const orderBlock = Array.from(document.querySelectorAll('[data-testid="object-attribute"]')).find(el =>
                    !el.closest('#bf-custom-ticket-buttons, [data-testid="compose-form"]') &&
                    /order number/i.test(el.textContent || ''));
                  const refreshBtn = orderBlock?.querySelector('[data-testid="object-attribute-refresh"]');
                  if (refreshBtn) {
                    console.log('[BF Kairos] Clicking Order Refresh to load order data...');
                    refreshBtn.click();
                    await new Promise(r => setTimeout(r, 1200));
                    try { orderNo = extractOrderNumber(true) || ''; } catch (e) {}
                    if (orderNo) console.log('[BF Kairos] Order number after refresh:', orderNo);
                  }
                } catch (e) {}
              }
              // Order typed FIRST (its fetch re-renders the form — later would wipe the tree)
              if (orderNo) await typeModalOrderNo(orderNo);
              else console.log('[BF Kairos] No order number found for modal.');
              // Poll for a modal trigger (fields render progressively after Via selection)
              const waitModalTrigger = async (field, ms = 2500) => {
                const t0 = Date.now();
                let tr = null;
                while (Date.now() - t0 < ms) {
                  tr = findDropdownTrigger(field);
                  if (tr && document.body.contains(tr)) return tr;
                  await new Promise(r => setTimeout(r, 60));
                }
                return findDropdownTrigger(field);
              };
              const buTr = await waitModalTrigger('Business unit');
              if (buTr && !isDropdownSelected(buTr, 'Food Aggregation')) {
                console.log('[BF Kairos] Setting modal Business unit: Food Aggregation...');
                const buOk = await assertDropdown('Business unit', 'Food Aggregation', 3000);
                console.log('[BF Kairos] Modal Business unit result:', buOk);
                await new Promise(r => setTimeout(r, 300));
              } else if (!buTr) {
                console.log('[BF Kairos] Modal Business unit trigger NOT FOUND.');
              }
              // Type
              const typeVal = isComplain ? 'Complaints' : (isFeedback ? 'Feedback' : (low.includes('internal') ? 'Internal Requests' : tType));
              if (typeVal) {
                const typeTr = await waitModalTrigger('Type');
                if (typeTr && !isDropdownSelected(typeTr, typeVal)) {
                  console.log('[BF Kairos] Setting modal Type:', typeVal);
                  await assertDropdown('Type', typeVal, 3000);
                  await new Promise(r => setTimeout(r, 150));
                }
              }
              // Status always Open (agent adjusts manually if needed)
              const stTr = await waitModalTrigger('Status');
              if (stTr && !isDropdownSelected(stTr, 'Open')) {
                console.log('[BF Kairos] Setting modal Status: Open...');
                await assertDropdown('Status', 'Open', 3000);
                await new Promise(r => setTimeout(r, 150));
              } else if (!stTr) {
                console.log('[BF Kairos] Modal Status trigger NOT FOUND.');
              }
              // Team (Complaints + Feedback — from tool Settings dropdown)
              const confTeam = getDefaultTeam();
              if (isComplain || isFeedback) {
                const teamTr = await waitModalTrigger('Team');
                if (teamTr && !isDropdownSelected(teamTr, confTeam)) {
                  console.log('[BF Kairos] Setting modal Team:', confTeam);
                  await assertDropdown('Team', confTeam, 3000);
                  await new Promise(r => setTimeout(r, 150));
                }
              }
              // Cascade L1 (category) — Food Aggregation complaint / Feedback type
              if (tCat) {
                const l1field = isComplain ? 'Food Aggregation complaint' : 'Feedback type';
                const l1Tr = await waitModalTrigger(l1field, 1500);
                if (!l1Tr) console.log('[BF Kairos] Modal L1 trigger not found yet, retrying...');
                try {
                  const dbgBtns = getTreeCascadeButtons().map(b => getKairosTriggerText(b));
                  console.log('[BF Kairos] Cascade buttons:', JSON.stringify(dbgBtns), '| L1 resolved to:', JSON.stringify(l1Tr ? getKairosTriggerText(l1Tr) : null));
                } catch (e) {}
                const l1Ok = await assertDropdown(l1field, tCat, 3000);
                console.log(`[BF Kairos] Modal L1 "${tCat}" result:`, l1Ok);
                await new Promise(r => setTimeout(r, 150));
              }
              // Cascade L2 (detail) — Sub-category (waits for L2 to render after L1 commits)
              const waitCascadeLevel = async (idx, ms = 3500) => {
                const t0 = Date.now();
                while (Date.now() - t0 < ms) {
                  try {
                    if (getTreeCascadeButtons().length > idx) return true;
                  } catch (e) {}
                  await new Promise(r => setTimeout(r, 150));
                }
                return false;
              };
              if (tDet) {
                let l2Ready = await waitCascadeLevel(1);
                if (!l2Ready) {
                  // L1 likely didn't commit — retry it once, then wait again.
                  console.log('[BF Kairos] L2 did not render — retrying L1 once...');
                  await assertDropdown(l1field, tCat, 3000);
                  l2Ready = await waitCascadeLevel(1);
                }
                if (!l2Ready) console.log('[BF Kairos] L2 still not rendered — attempting anyway.');
                try {
                  const dbgBtns2 = getTreeCascadeButtons().map(b => getKairosTriggerText(b));
                  console.log('[BF Kairos] Cascade buttons (L2 step):', JSON.stringify(dbgBtns2));
                } catch (e) {}
                const l2Ok = await assertDropdown('Sub-category', tDet, 4000);
                console.log(`[BF Kairos] Modal L2 "${tDet}" result:`, l2Ok);
                await new Promise(r => setTimeout(r, 150));
              }
              // Cascade L3 (sub-detail) — Detail (waits for L3 to render after L2 commits)
              if (tSub) {
                const l3Ready = await waitCascadeLevel(2);
                if (!l3Ready) console.log('[BF Kairos] L3 not rendered — attempting on last cascade button.');
                const l3Ok = await assertDropdown('Detail', tSub, 4000);
                console.log(`[BF Kairos] Modal L3 "${tSub}" result:`, l3Ok);
                await new Promise(r => setTimeout(r, 150));
              }
              // Subject: "Category - Detail - orderNumber"
              const parts = [tCat, tDet, tSub].filter(p => p && p.trim());
              let subjVal = parts.join(' - ');
              if (orderNo) subjVal = subjVal ? `${subjVal} - ${orderNo}` : orderNo;
              setModalSubject(subjVal);
              return true;
            }

          } else if (!toInput) {
            console.warn('[BF Kairos] To input in New Conversation modal not found within timeout.');
          }

        } catch (err) {
          console.error('[BF Kairos] Error in Create Ticket flow:', err);
          showToast('Error in Create Ticket: ' + err.message, 'error');
        } finally {
          setTimeout(() => btnEl.textContent = origText, 1500);
        }
        return;
      }
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
        if (orderNumber && isValidOrderNumber(orderNumber)) res += `&bf_order_number=${encodeURIComponent(orderNumber)}`;
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
      const orderNo = extractOrderNumber();
      if (orderNo) {
        const parts = orderNo.split('-');
        const wpPostId = parts.length > 1 ? parts[1] : orderNo;
        if (/^\d{5,14}$/.test(wpPostId)) {
          const derivedUrl = `https://www.breadfast.com/wp-admin/post.php?post=${wpPostId}&action=edit`;
          ticketDataCache.orderLink = derivedUrl;
          return derivedUrl;
        }
      }

      const safeLinks = Array.from(document.querySelectorAll('a'))
        .filter(el => !isInsideConversation(el));

      for (const a of safeLinks) {
        const text = (a.textContent || '').trim().toLowerCase();
        const href = a.getAttribute('href') || a.href || '';
        if (text === 'order' && (href.includes('post.php') || href.includes('breadfast.com'))) {
          const res = href.startsWith('http') ? href : (a.href || href);
          ticketDataCache.orderLink = res;
          return res;
        }
      }

      for (const a of safeLinks) {
        const href = a.getAttribute('href') || a.href || '';
        if (href.includes('/wp-admin/post.php') || href.includes('breadfast.com/wp-admin')) {
          const res = href.startsWith('http') ? href : (a.href || href);
          ticketDataCache.orderLink = res;
          return res;
        }
      }

      for (const a of safeLinks) {
        const text = (a.textContent || '').trim().toLowerCase();
        if (text === 'order' && a.href && a.href.startsWith('http')) {
          ticketDataCache.orderLink = a.href;
          return a.href;
        }
      }

      for (const a of safeLinks) {
        const text = (a.textContent || '').trim().toLowerCase();
        const href = a.getAttribute('href') || a.href || '';
        if (text.includes('order') && href.includes('post.php')) {
          const res = href.startsWith('http') ? href : (a.href || href);
          ticketDataCache.orderLink = res;
          return res;
        }
      }

      // 2. Check accessible iframes (sidebar apps)
      try {
        const iframes = Array.from(document.querySelectorAll('iframe'));
        for (const f of iframes) {
          try {
            const doc = f.contentDocument || f.contentWindow?.document;
            if (!doc) continue;
            const ifrLinks = Array.from(doc.querySelectorAll('a, button, [data-url], [data-href]'));
            for (const a of ifrLinks) {
              const text = (a.textContent || '').trim().toLowerCase();
              const href = a.getAttribute('href') || a.href || a.getAttribute('data-url') || a.getAttribute('data-href') || '';
              if ((text.includes('order') || href.includes('post.php') || href.includes('wp-admin')) && href.includes('post=')) {
                const res = href.startsWith('http') ? href : (a.href || href);
                ticketDataCache.orderLink = res;
                return res;
              }
            }
          } catch (e) { }
        }
      } catch (e) { }

      // 3. Search document HTML directly for breadfast.com/wp-admin/post.php?post=\d+
      try {
        const bodyHtml = document.body ? document.body.innerHTML : '';
        const m = bodyHtml.match(/(https?:\/\/(?:www\.)?breadfast\.com\/wp-admin\/post\.php\?[^"'\s<>]+)/i);
        if (m && m[1]) {
          const cleanUrl = m[1].replace(/&amp;/g, '&');
          ticketDataCache.orderLink = cleanUrl;
          return cleanUrl;
        }
      } catch (e) { }

      if (ticketDataCache.orderLink) {
        return ticketDataCache.orderLink;
      }

      return null;
    }

    function extractWpOrderId() {
      // 1. Extract post parameter from findOrderLink()
      try {
        const orderLink = findOrderLink();
        if (orderLink) {
          const m = orderLink.match(/[?&]post=(\d{5,14})/i);
          if (m && m[1]) return m[1];
        }
      } catch (e) { }

      // 2. Scan all links and buttons across DOM for post.php?post= or data-post-id
      try {
        const safeEls = Array.from(document.querySelectorAll('a, button, [role="button"], [data-url], [data-href], [data-post-id], [data-order-id]'))
          .filter(el => !isInsideConversation(el));

        for (const el of safeEls) {
          const text = (el.textContent || '').trim().toLowerCase();
          const href = el.getAttribute('href') || el.href || el.getAttribute('data-url') || el.getAttribute('data-href') || el.getAttribute('onclick') || '';
          if (href && (href.includes('post.php') || href.includes('wp-admin'))) {
            const m = href.match(/[?&]post=(\d{5,14})/i);
            if (m && m[1]) return m[1];
          }
          const dataPost = el.getAttribute('data-post-id') || el.getAttribute('data-id') || el.getAttribute('data-order-id') || '';
          if (dataPost && /^\d{5,14}$/.test(dataPost) && (text.includes('order') || (el.className || '').toLowerCase().includes('order'))) {
            return dataPost;
          }
        }
      } catch (e) { }

      // 3. Scan accessible iframes (sidebar apps)
      try {
        const iframes = Array.from(document.querySelectorAll('iframe'));
        for (const f of iframes) {
          try {
            const doc = f.contentDocument || f.contentWindow?.document;
            if (!doc) continue;
            const ifrLinks = Array.from(doc.querySelectorAll('a, button, [data-url], [data-href]'));
            for (const el of ifrLinks) {
              const href = el.getAttribute('href') || el.href || el.getAttribute('data-url') || el.getAttribute('data-href') || el.getAttribute('onclick') || '';
              if (href && (href.includes('post.php') || href.includes('wp-admin'))) {
                const m = href.match(/[?&]post=(\d{5,14})/i);
                if (m && m[1]) return m[1];
              }
            }
            const ifrMatch = (doc.body ? doc.body.innerHTML : '').match(/(?:wp-admin\/)?post\.php\?[^"'\s<>]*post=(\d{5,14})/i);
            if (ifrMatch && ifrMatch[1]) return ifrMatch[1];
          } catch (e) { }
        }
      } catch (e) { }

      // 4. Raw HTML regex match for post.php?post=\d+
      try {
        const bodyHtml = document.body ? document.body.innerHTML : '';
        const m = bodyHtml.match(/(?:wp-admin\/)?post\.php\?[^"'\s<>]*post=(\d{5,14})/i);
        if (m && m[1]) return m[1];
      } catch (e) { }

      // 5. Fallback: extractOrderNumber()
      try {
        const orderNo = extractOrderNumber();
        if (orderNo) {
          const clean = orderNo.includes('-') ? (orderNo.split('-')[1] || orderNo) : orderNo;
          return clean.replace(/^[^\d]+/, '').trim();
        }
      } catch (e) { }

      return '';
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
        // Strictly reject order numbers (13 digits starting with 2[1-9] like 2345678901234)
        if (cleaned.length === 13 && /^2[1-9]/.test(cleaned)) {
          return null;
        }
        return cleaned;
      }

      return null;
    }

    function scanCustomerPhoneFromDom() {
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

    function extractCustomerPhone(useCache = true) {
      const live = scanCustomerPhoneFromDom();
      if (live) {
        const curId = getCurrentTicketId();
        if (curId && ticketDataCache.ticketId === curId) {
          ticketDataCache.customerPhone = live;
        }
        return live;
      }

      if (useCache && ticketDataCache.customerPhone &&
          ticketDataCache.ticketId && ticketDataCache.ticketId === getCurrentTicketId()) {
        return ticketDataCache.customerPhone;
      }

      return null;
    }

    function handleChat(btnEl) {
      if (btnEl.dataset.loading === 'true') return;
      btnEl.dataset.loading = 'true';
      const origText = btnEl.textContent;
      btnEl.textContent = 'Opening...';

      // Customer phone from the current page only (no order-page background tabs)
      const findPagePhone = () => {
        try {
          const tels = Array.from(document.querySelectorAll('a[href^="tel:"]'))
            .filter(el => !el.closest('#bf-custom-ticket-buttons, #bf-continue-tree-btn, #bf-settings-panel, [data-testid="compose-form"]'));
          for (const a of tels) {
            const raw = (a.getAttribute('href') || '').replace(/^tel:/i, '').trim() || (a.textContent || '').trim();
            const p = formatPhoneForKairos(raw);
            if (p) return p;
          }
        } catch (e) {}
        try {
          const panel = document.querySelector('[data-testid*="contact"], aside, [class*="sidepanel"]');
          const txt = ((panel || document).textContent || '');
          const m = txt.match(/(?:(?:\+?20|0020)[\s\-()]*)?0?1[0125][\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d[\s\-()]*\d/);
          if (m) {
            const p = formatPhoneForKairos(m[0]);
            if (p) return p;
          }
        } catch (e) {}
        try {
          if (typeof bfTicketStore !== 'undefined' && bfTicketStore.phone) {
            const p = formatPhoneForKairos(bfTicketStore.phone);
            if (p) return p;
          }
        } catch (e) {}
        try {
          const cached = extractCustomerPhone();
          if (cached) return cached;
        } catch (e) {}
        return '';
      };

      const openSearch = (phone) => {
        const kairosUrl = `https://kairos.breadfast.com/app/accounts/1/search?q=${encodeURIComponent(phone)}`;
        btnEl.textContent = origText;
        btnEl.dataset.loading = 'false';
        showToast(`Customer Chat opened (${phone})`, 'info');
        window.open(kairosUrl, '_blank', 'noopener,noreferrer');
      };

      (async () => {
        let phone = findPagePhone();
        // The phone lives in the Contact tab — open it once and retry
        if (!phone && isKairos) {
          try {
            const contactTab = document.querySelector('button[data-testid="conversation-sidepanel-tab-contact"], [data-testid="conversation-sidepanel-tab-contact"]') ||
              Array.from(document.querySelectorAll('button[data-testid*="sidepanel-tab"]')).find(b => (b.textContent || '').toLowerCase().includes('contact'));
            if (contactTab && contactTab.getAttribute('aria-pressed') !== 'true') {
              contactTab.click();
              const t0 = Date.now();
              while (Date.now() - t0 < 2000) {
                await new Promise(r => setTimeout(r, 100));
                phone = findPagePhone();
                if (phone) break;
              }
            }
          } catch (e) {}
        }
        if (!phone) {
          btnEl.textContent = origText;
          btnEl.dataset.loading = 'false';
          showToast('Could not find customer phone on this ticket.', 'error');
          return;
        }
        openSearch(phone);
      })();
    }

    chatBtn.addEventListener('click', async () => {
      // Scroll to top so customer phone/UID/order link are visible before extraction
      await scrollToTicketTop();
      handleChat(chatBtn);
    });

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

      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        finish();
        showToast('تم تحديث الإضافة: يرجى عمل Refresh (F5) لصفحة Freshdesk.', 'error');
        return;
      }

      try {
        chrome.runtime.sendMessage({ action: 'calculate_delay', url: orderLink }, (response) => {
          if (isFinished) return;
          finish();

          if (chrome.runtime.lastError) {
            console.log('[BF Extension]', chrome.runtime.lastError);
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
          if ((e.message || '').includes('sendMessage') || (e.message || '').includes('Extension context invalidated')) {
            showToast('تم تحديث الإضافة: يرجى عمل Refresh (F5) لصفحة Freshdesk.', 'error');
          } else {
            showToast('Extension error: ' + e.message, 'error');
          }
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
        '✨ Custom Emails',
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
            padding: 3px 10px;
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
            padding: 5px 8px;
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
            padding: 6px 14px;
            background: #ec4899;
            color: #ffffff;
            border: 1px solid #db2777;
            border-radius: 6px;
            font-size: 11px;
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
            padding: 5px 11px;
            background: #334155;
            color: #cbd5e1;
            border: 1px solid #475569;
            border-radius: 6px;
            font-size: 11px;
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
          .bf-email-mode-tab {
            padding: 4px 10px;
            background: #0f172a;
            color: #94a3b8;
            border: 1px solid #334155;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.15s ease;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            outline: none;
          }
          .bf-email-mode-tab:hover {
            color: #f8fafc;
            background: #1e293b;
            border-color: #475569;
          }
          .bf-email-mode-tab.active {
            background: #7c3aed;
            color: #ffffff;
            border-color: #a78bfa;
            box-shadow: 0 2px 8px rgba(124, 58, 237, 0.4);
          }
          .bf-custom-checkbox-label {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            font-weight: 600;
            color: #cbd5e1;
            cursor: pointer;
            user-select: none;
          }
          .bf-custom-checkbox-label input {
            cursor: pointer;
            accent-color: #7c3aed;
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

        // Arabic names are left empty for manual entry (per agent request — no auto-transliteration)
        if (/[\u0600-\u06FF]/.test(firstWord)) {
          return '';
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
      // Order: live DOM → per-ticket cache → central store (Properties tab may be closed)
      let orderNo = extractOrderNumber() || '';
      if (!isValidOrderNumber(orderNo)) {
        try { orderNo = readCachedTicketOrder() || ''; } catch (e) {}
      }
      if (!isValidOrderNumber(orderNo)) {
        try { orderNo = (typeof bfTicketStore !== 'undefined' && bfTicketStore.orderNumber) || ''; } catch (e) {}
      }
      if (!isValidOrderNumber(orderNo)) orderNo = '';
      let agentName = '';
      try {
        agentName = localStorage.getItem('bf_agent_name') || '';
      } catch (e) {}

      // Custom Email Templates storage & defaults
      const STORAGE_KEY_CUSTOM_TEMPLATES = 'bf_custom_email_templates';
      const DEFAULT_CUSTOM_TEMPLATES = [
        {
          id: 'custom_delay_apology',
          name: 'Delayed Order Apology',
          regarding: 'the delay of your order',
          body: 'We sincerely apologize for the unexpected delay with your order today due to high operational demand. Our driver is on the way to your address and should arrive shortly. We truly appreciate your patience and understanding.',
          wrapHeader: true,
          wrapFooter: true
        },
        {
          id: 'custom_missing_item',
          name: 'Missing Item Wallet Refund',
          regarding: 'the missing item from your order',
          body: 'We deeply apologize that an item from your order was missing upon delivery. I have investigated this with our dispatch team, and the full value has been refunded back to your Breadfast wallet along with an apology voucher.',
          wrapHeader: true,
          wrapFooter: true
        },
        {
          id: 'custom_out_of_stock',
          name: 'Out of Stock Product Notification',
          regarding: 'an out of stock product in your order',
          body: 'While preparing your order, we noticed that one of your requested items is unfortunately out of stock. We sincerely apologize for this inconvenience. The item value has been immediately refunded to your Breadfast wallet, and the remainder of your order is on its way.',
          wrapHeader: true,
          wrapFooter: true
        }
      ];

      const getSavedCustomTemplates = () => {
        try {
          const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_TEMPLATES);
          if (!raw) {
            localStorage.setItem(STORAGE_KEY_CUSTOM_TEMPLATES, JSON.stringify(DEFAULT_CUSTOM_TEMPLATES));
            return [...DEFAULT_CUSTOM_TEMPLATES];
          }
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch (e) { }
        return [...DEFAULT_CUSTOM_TEMPLATES];
      };

      const saveCustomTemplatesToStorage = (templates) => {
        try {
          localStorage.setItem(STORAGE_KEY_CUSTOM_TEMPLATES, JSON.stringify(templates));
        } catch (e) { }
      };

      let customTemplates = getSavedCustomTemplates();
      let currentEmailMode = 'templates'; // 'templates' or 'custom'
      // Auto-track ticket changes while the modal stays open (updates number + name).
      let ticketWatchIv = null;
      let lastEmailTid = null;
      try { lastEmailTid = getCurrentTicketId(); } catch (e) {}
      let selectedCustomTemplateId = customTemplates[0]?.id || '__new__';

      // Calculate initial positioning & dimensions
      const initW = 620;
      const initH = Math.min(Math.round(window.innerHeight * 0.9), 780);
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
      `;

      // Header
      const header = document.createElement('div');
      header.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        background: #0f172a;
        border-bottom: 1px solid #334155;
        cursor: grab;
        user-select: none;
        flex-shrink: 0;
      `;

      const titleWrap = document.createElement('div');
      titleWrap.style.cssText = 'display:flex; align-items:center; gap:12px;';
      titleWrap.innerHTML = `
        <div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-weight: 700; font-size: 13px; color: #f8fafc;">Email Templates</span>
            <span style="font-size: 10px; color: #64748b;" title="Tool version">v1.1</span>
            <a href="https://docs.google.com/document/d/1pD1azNjn2PeNx2sDQQNxDuhXVvLoGdP2XJpUYP7vohM/edit?pli=1&tab=t.0" target="_blank" rel="noopener noreferrer" style="font-size: 11px; color: #c4b5fd; text-decoration: none; border: 1px solid rgba(167, 139, 250, 0.4); padding: 1px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; background: rgba(124, 58, 237, 0.2);" title="Open Google Docs Email Templates">📄 Docs ↗</a>
          </div>
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
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 6px;
        transition: color 0.15s, background 0.15s;
      `;
      closeBtn.addEventListener('mouseenter', () => { closeBtn.style.color = '#fff'; closeBtn.style.background = '#334155'; });
      closeBtn.addEventListener('mouseleave', () => { closeBtn.style.color = '#94a3b8'; closeBtn.style.background = 'transparent'; });
      const closeModal = () => {
        try { clearInterval(ticketWatchIv); } catch (e) {}
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
      body.style.cssText = 'padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; flex: 1; min-height: 0;';

      // Mode Switcher Tabs (Predefined Templates vs Custom Email)
      const modeTabsRow = document.createElement('div');
      modeTabsRow.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 6px; background: #0f172a; padding: 4px; border-radius: 8px; border: 1px solid #334155; flex-shrink: 0;';
      modeTabsRow.innerHTML = `
        <button type="button" class="bf-email-mode-tab active" id="bf-email-tab-templates">📋 Predefined Templates</button>
        <button type="button" class="bf-email-mode-tab" id="bf-email-tab-custom">✍️ Custom Email</button>
      `;
      body.appendChild(modeTabsRow);

      // 1. Controls Row: Customer Name, Order Number, Agent Name
      const row1 = document.createElement('div');
      row1.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; flex-shrink: 0;';
      row1.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:4px; min-width:0;">
          <label style="font-size:11px; font-weight:600; color:#cbd5e1;">Customer Name:</label>
          <input type="text" id="bf-email-cust-name" class="bf-email-input" value="${custName.replace(/"/g, '&quot;')}" placeholder="e.g. Ahmed" />
        </div>
        <div style="display:flex; flex-direction:column; gap:4px; min-width:0;">
          <label style="font-size:11px; font-weight:600; color:#cbd5e1;">Order Number:</label>
          <input type="text" id="bf-email-order-no" class="bf-email-input" value="${orderNo.replace(/"/g, '&quot;')}" placeholder="e.g. 1234-567890123" />
        </div>
        <div style="display:flex; flex-direction:column; gap:4px; min-width:0;">
          <label style="font-size:11px; font-weight:600; color:#cbd5e1;">Agent Name (YY):</label>
          <input type="text" id="bf-email-agent-name" class="bf-email-input" value="${agentName.replace(/"/g, '&quot;')}" placeholder="Your Name" />
        </div>
      `;
      body.appendChild(row1);

      // 2. Greeting Selector Row
      const greetingRow = document.createElement('div');
      greetingRow.style.cssText = 'display:flex; align-items:center; justify-content:space-between; background:#0f172a; padding:5px 10px; border-radius:8px; border:1px solid #334155; flex-shrink: 0;';
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
        <div style="display:flex; flex-direction:column; gap:4px; min-width:0;">
          <label style="font-size:11px; font-weight:700; color:#cbd5e1;">Category:</label>
          <select id="bf-email-cat-select" class="bf-email-input" style="cursor:pointer; font-size:12px; font-weight:600; padding:5px 8px;">
          </select>
        </div>
        <div style="display:flex; flex-direction:column; gap:4px; min-width:0;">
          <label style="font-size:11px; font-weight:700; color:#cbd5e1;">Template:</label>
          <div style="display:flex; gap:6px; min-width:0;">
            <select id="bf-email-tpl-select" class="bf-email-input" style="flex:1; min-width:0; cursor:pointer; font-size:12px; font-weight:600; padding:5px 8px;">
            </select>
            <input type="text" id="bf-email-search" placeholder="🔍" title="Search templates..." style="width:64px; flex-shrink:0; box-sizing:border-box; padding:5px 6px; font-size:11px; background:#0f172a; border:1px solid #475569; border-radius:6px; color:#fff; outline:none;" />
          </div>
        </div>
      `;
      body.appendChild(tplRow);

      // 4. Dynamic Extra Variables Row (Container)
      const extraFieldsContainer = document.createElement('div');
      extraFieldsContainer.id = 'bf-email-extra-fields';
      extraFieldsContainer.style.cssText = 'display:none; flex-wrap:wrap; gap:6px; background:#0f172a; padding:6px 8px; border-radius:8px; border:1px solid #334155; flex-shrink: 0;';
      body.appendChild(extraFieldsContainer);

      // 4.5 Custom Email Section (Displayed when Custom Email tab is active)
      const customEmailContainer = document.createElement('div');
      customEmailContainer.id = 'bf-email-custom-section';
      customEmailContainer.style.cssText = 'display: none; flex-direction: column; gap: 8px; flex-shrink: 0;';
      customEmailContainer.innerHTML = `
        <div style="display:grid; grid-template-columns: minmax(0, 1fr) auto auto; gap:8px; align-items:end;">
          <div style="display:flex; flex-direction:column; gap:4px; min-width:0;">
            <label style="font-size:11px; font-weight:700; color:#cbd5e1;">Custom Template:</label>
            <select id="bf-custom-tpl-select" class="bf-email-input" style="cursor:pointer; font-size:12px; font-weight:600; padding:5px 8px; width:100%; box-sizing:border-box;">
            </select>
          </div>
          <button type="button" id="bf-custom-tpl-save-btn" class="bf-email-secondary-btn" style="padding:5px 12px; font-size:11px; white-space:nowrap; background:#2563eb; color:#ffffff; border-color:#1d4ed8;" title="Save current custom email as a template">💾 Save</button>
          <button type="button" id="bf-custom-tpl-delete-btn" class="bf-email-secondary-btn" style="padding:5px 10px; font-size:11px; white-space:nowrap; color:#f87171;" title="Delete this custom template">🗑️</button>
        </div>



        <div style="display:flex; gap:14px; align-items:center; background:#0f172a; padding:5px 8px; border-radius:6px; border:1px solid #334155;">
          <label class="bf-custom-checkbox-label">
            <input type="checkbox" id="bf-custom-wrap-header" checked />
            <span>Official Greeting & Intro</span>
          </label>
          <label class="bf-custom-checkbox-label">
            <input type="checkbox" id="bf-custom-wrap-footer" checked />
            <span>Official Apology & Sign-off</span>
          </label>
        </div>
      `;
      body.appendChild(customEmailContainer);

      // 5. Live Preview Textarea (Flex-grow with window height)
      const previewGroup = document.createElement('div');
      previewGroup.style.cssText = 'display:flex; flex-direction:column; gap:4px; flex:1; min-height:200px;';
      previewGroup.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
          <label style="font-size:11px; font-weight:700; color:#94a3b8;">LIVE EMAIL PREVIEW (EDITABLE):</label>
          <span style="font-size:10px; color:#64748b;">Direct edits are preserved</span>
        </div>
        <textarea id="bf-email-preview" class="bf-email-scrollbar" style="width:100%; height:100%; min-height:150px; box-sizing:border-box; padding:10px 12px; background:#0f172a; border:1px solid #475569; border-radius:8px; color:#ffffff; font-size:13px; line-height:1.5; outline:none; resize:none; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; transition:border-color 0.2s;"></textarea>
      `;
      body.appendChild(previewGroup);

      // 6. Action Bar footer (FIXED outside the scroll area so buttons are never cut off)
      const actionRow = document.createElement('div');
      actionRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:8px; padding:7px 12px; border-top:1px solid #334155; background:#0f172a; border-radius:0 0 12px 12px; flex-shrink:0;';
      actionRow.innerHTML = `
        <button type="button" class="bf-email-secondary-btn" id="bf-email-reset-btn" title="Refresh Customer Name & Order Number from current ticket">Reset</button>
        <button type="button" class="bf-email-action-btn" id="bf-email-copy-btn">Copy Email</button>
      `;
      modal.appendChild(body);
      modal.appendChild(actionRow);

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

      const tabTemplatesBtn = modal.querySelector('#bf-email-tab-templates');
      const tabCustomBtn = modal.querySelector('#bf-email-tab-custom');
      const customSection = modal.querySelector('#bf-email-custom-section');
      const customTplSelect = modal.querySelector('#bf-custom-tpl-select');
      const customSaveBtn = modal.querySelector('#bf-custom-tpl-save-btn');
      const customDeleteBtn = modal.querySelector('#bf-custom-tpl-delete-btn');

      const customWrapHeaderInp = modal.querySelector('#bf-custom-wrap-header');
      const customWrapFooterInp = modal.querySelector('#bf-custom-wrap-footer');

      const renderCustomEmail = (p) => {
        const wrapHeader = customWrapHeaderInp ? customWrapHeaderInp.checked : true;
        const wrapFooter = customWrapFooterInp ? customWrapFooterInp.checked : true;

        const parts = [];

        if (wrapHeader) {
          parts.push(`Good ${p.greeting} ${p.customerName},`);
          parts.push('Hope you’re doing well.');
          parts.push(`This is ${p.agentName} from Breadfast's team. I'm contacting you regarding order #${p.orderNumber}.`);
        }

        if (!wrapHeader && !wrapFooter) {
          parts.push('(Edit your custom email in the preview below...)');
        }

        if (wrapFooter) {
          parts.push('Once more, we sincerely apologize for any inconvenience caused, and we are right here to assist you at any time.');
          parts.push('Regards,\nBreadfast Team.');
        }

        return parts.join('\n\n');
      };

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
          wrap.style.cssText = 'display:flex; flex-direction:column; gap:2px; flex:1; min-width:100px;';

          const lbl = document.createElement('label');
          lbl.style.cssText = 'font-size:9px; font-weight:700; color:#cbd5e1;';
          lbl.textContent = fld.label + ':';

          const inp = document.createElement('input');
          inp.type = 'text';
          inp.className = 'bf-email-input';
          inp.style.padding = '4px 8px';
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

      let customRawTemplate = ''; // stores custom email with XX (customer) / XXX (order) placeholders

      const resolveCustomPlaceholders = (tpl, p) => {
        // Order matters: replace XXX first (longer) to avoid XX matching inside XXX
        return tpl
          .split('XXX').join(p.orderNumber)
          .split('XX').join(p.customerName);
      };

      const unresolveCustomPlaceholders = (text, p) => {
        // Reverse: replace actual values back to placeholders
        let raw = text;
        if (p.orderNumber && p.orderNumber !== 'XXX') {
          raw = raw.split(p.orderNumber).join('XXX');
        }
        if (p.customerName && p.customerName !== 'XX') {
          raw = raw.split(p.customerName).join('XX');
        }
        return raw;
      };

      const updateEmailPreview = () => {
        const rawCust = custNameInput.value.trim();
        const firstName = getFirstName(rawCust) || rawCust || 'XX';

        const params = {
          greeting: activeGreeting,
          customerName: firstName,
          orderNumber: orderNoInput.value.trim() || 'XXX-XXXXXXX',
          agentName: agentNameInput.value.trim() || 'YY',
          ...extraInputValues
        };

        if (currentEmailMode === 'custom') {
          if (!customRawTemplate) {
            // Generate fresh template with placeholders
            customRawTemplate = renderCustomEmail({
              ...params,
              customerName: 'XX',
              orderNumber: 'XXX'
            });
          }
          previewText.value = resolveCustomPlaceholders(customRawTemplate, params);
          return;
        }

        const selectedId = tplSelect.value;
        const tpl = EMAIL_TEMPLATES.find(t => t.id === selectedId) || EMAIL_TEMPLATES[0];
        if (!tpl) {
          previewText.value = '';
          return;
        }

        // Format: add blank lines between paragraphs for readability,
        // but keep consecutive numbered list items (e.g. "1-", "2-") single-spaced
        const rawEmail = tpl.render(params);
        const lines = rawEmail.split('\n');
        let formatted = '';
        for (let i = 0; i < lines.length; i++) {
          formatted += lines[i];
          if (i < lines.length - 1) {
            const nextLine = lines[i + 1].trimStart();
            const currentLine = lines[i].trimStart();
            // Keep numbered list items single-spaced (e.g. "1-", "2-", "3)")
            const isNumberedCurrent = /^\d+[\-\)\.]/.test(currentLine);
            const isNumberedNext = /^\d+[\-\)\.]/.test(nextLine);
            if (isNumberedCurrent && isNumberedNext) {
              formatted += '\n';
            } else {
              formatted += '\n\n';
            }
          }
        }
        previewText.value = formatted;
      };

      // Populate Custom Template Dropdown
      const populateCustomTemplateDropdown = () => {
        customTplSelect.innerHTML = '';

        const newOpt = document.createElement('option');
        newOpt.value = '__new__';
        newOpt.textContent = '✨ New Blank Custom Email';
        customTplSelect.appendChild(newOpt);

        if (customTemplates.length > 0) {
          const group = document.createElement('optgroup');
          group.label = 'Saved Templates';
          customTemplates.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.name;
            group.appendChild(opt);
          });
          customTplSelect.appendChild(group);
        }

        customTplSelect.value = selectedCustomTemplateId;
        if (customTplSelect.selectedIndex === -1) {
          customTplSelect.selectedIndex = 0;
          selectedCustomTemplateId = customTplSelect.value;
        }

        customDeleteBtn.style.display = selectedCustomTemplateId === '__new__' ? 'none' : 'inline-flex';
      };

      const loadCustomTemplate = (id) => {
        selectedCustomTemplateId = id;
        customDeleteBtn.style.display = id === '__new__' ? 'none' : 'inline-flex';

        if (id === '__new__') {
          customWrapHeaderInp.checked = true;
          customWrapFooterInp.checked = true;
          customRawTemplate = ''; // reset so fresh render happens
        } else {
          const found = customTemplates.find(t => t.id === id);
          if (found) {
            customWrapHeaderInp.checked = found.wrapHeader !== false;
            customWrapFooterInp.checked = found.wrapFooter !== false;
            // Load saved body (with placeholders) into raw template
            if (found.body) {
              customRawTemplate = found.body;
            }
          }
        }
        updateEmailPreview();
      };

      // Mode Tabs Event Listeners
      tabTemplatesBtn.addEventListener('click', () => {
        currentEmailMode = 'templates';
        tabTemplatesBtn.classList.add('active');
        tabCustomBtn.classList.remove('active');
        tplRow.style.display = 'grid';
        customSection.style.display = 'none';
        renderExtraFields(EMAIL_TEMPLATES.find(t => t.id === tplSelect.value));
        updateEmailPreview();
      });

      tabCustomBtn.addEventListener('click', () => {
        currentEmailMode = 'custom';
        tabCustomBtn.classList.add('active');
        tabTemplatesBtn.classList.remove('active');
        tplRow.style.display = 'none';
        extraFieldsContainer.style.display = 'none';
        customSection.style.display = 'flex';
        if (!customRawTemplate) customRawTemplate = ''; // ensure fresh render
        updateEmailPreview();
      });

      // Custom Email Controls Events
      customTplSelect.addEventListener('change', () => {
        loadCustomTemplate(customTplSelect.value);
      });


      customWrapHeaderInp.addEventListener('change', () => {
        customRawTemplate = ''; // regenerate with new wrap setting
        updateEmailPreview();
      });
      customWrapFooterInp.addEventListener('change', () => {
        customRawTemplate = ''; // regenerate with new wrap setting
        updateEmailPreview();
      });

      // Capture user edits in preview back to raw template with placeholders
      previewText.addEventListener('input', () => {
        if (currentEmailMode === 'custom') {
          const rawCust = custNameInput.value.trim();
          const firstName = getFirstName(rawCust) || rawCust || 'XX';
          const curParams = {
            orderNumber: orderNoInput.value.trim() || 'XXX',
            customerName: firstName
          };
          customRawTemplate = unresolveCustomPlaceholders(previewText.value, curParams);
        }
      });

      customSaveBtn.addEventListener('click', () => {
        const previewContent = previewText.value.trim();
        if (!previewContent) {
          showToast('Please type a custom message before saving.', 'warning');
          return;
        }

        let existingName = '';
        if (selectedCustomTemplateId !== '__new__') {
          const cur = customTemplates.find(t => t.id === selectedCustomTemplateId);
          if (cur) existingName = cur.name;
        }

        const tplName = prompt('Enter a name for this custom template:', existingName || 'My Custom Email');
        if (!tplName || !tplName.trim()) return;

        const cleanName = tplName.trim();
        const id = selectedCustomTemplateId !== '__new__' ? selectedCustomTemplateId : ('custom_' + Date.now());

        const tplObj = {
          id,
          name: cleanName,
          body: customRawTemplate || previewContent,
          wrapHeader: customWrapHeaderInp.checked,
          wrapFooter: customWrapFooterInp.checked
        };

        const existingIdx = customTemplates.findIndex(t => t.id === id);
        if (existingIdx >= 0) {
          customTemplates[existingIdx] = tplObj;
        } else {
          customTemplates.push(tplObj);
        }

        saveCustomTemplatesToStorage(customTemplates);
        selectedCustomTemplateId = id;
        populateCustomTemplateDropdown();
        showToast(`Saved custom template "${cleanName}"!`, 'info');
      });

      customDeleteBtn.addEventListener('click', () => {
        if (selectedCustomTemplateId === '__new__') return;
        const cur = customTemplates.find(t => t.id === selectedCustomTemplateId);
        if (!cur) return;

        if (!confirm(`Delete custom template "${cur.name}"?`)) return;

        customTemplates = customTemplates.filter(t => t.id !== selectedCustomTemplateId);
        saveCustomTemplatesToStorage(customTemplates);
        selectedCustomTemplateId = '__new__';
        populateCustomTemplateDropdown();
        loadCustomTemplate('__new__');
        showToast('Custom template deleted.', 'info');
      });

      // Category Change Event
      catSelect.addEventListener('change', () => {
        if (catSelect.value === '✨ Custom Emails') {
          tabCustomBtn.click();
          return;
        }
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
      resetBtn.addEventListener('click', async () => {
        let freshCust = extractCustomerInfo();
        let freshOrder = extractOrderNumber();
        if (!freshOrder || !isValidOrderNumber(freshOrder)) {
          try { freshOrder = readCachedTicketOrder() || freshOrder; } catch (e) {}
        }
        if ((!freshOrder || !isValidOrderNumber(freshOrder)) && typeof bfTicketStore !== 'undefined' && bfTicketStore.orderNumber) {
          freshOrder = bfTicketStore.orderNumber;
        }
        // Name may live in the closed Properties tab — refresh the store (opens it
        // if needed) and re-read before giving up.
        let rawName = (freshCust && freshCust.name) ? freshCust.name.trim() : '';
        if (!rawName) {
          try {
            await refreshTicketStore(true);
            freshCust = extractCustomerInfo();
            rawName = (freshCust && freshCust.name) ? freshCust.name.trim() : '';
          } catch (e) {}
        }

        custNameInput.value = getFirstName(rawName);
        orderNoInput.value = (freshOrder && isValidOrderNumber(freshOrder)) ? freshOrder : '';

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
      populateCustomTemplateDropdown();
      loadCustomTemplate(selectedCustomTemplateId);

      // Auto-track: while open, follow ticket navigation (new ticket => refresh number + name).
      // Only fires on ticket CHANGE, so manual edits on the same ticket are never overwritten.
      ticketWatchIv = setInterval(async () => {
        try {
          if (!document.body.contains(modal)) { clearInterval(ticketWatchIv); return; }
          const curTid = getCurrentTicketId();
          if (!curTid || curTid === lastEmailTid) return;
          lastEmailTid = curTid;
          let freshOrder = '';
          try { freshOrder = extractOrderNumber() || ''; } catch (e) {}
          if (!freshOrder || !isValidOrderNumber(freshOrder)) {
            try { freshOrder = readCachedTicketOrder() || ''; } catch (e) {}
          }
          let freshName = '';
          try {
            const fi = extractCustomerInfo();
            freshName = getFirstName(((fi && fi.name) || '').trim());
          } catch (e) {}
          // Name/order may live in the closed Properties tab — warm the store first.
          if (!freshName || !freshOrder) {
            try { await refreshTicketStore(true); } catch (e) {}
            try {
              if (!freshName) {
                const fi2 = extractCustomerInfo();
                freshName = getFirstName(((fi2 && fi2.name) || '').trim());
              }
              if (!freshOrder || !isValidOrderNumber(freshOrder)) {
                const st = await refreshTicketStore(false);
                if (st && st.orderNumber) freshOrder = st.orderNumber;
              }
            } catch (e) {}
          }
          if (freshOrder && isValidOrderNumber(freshOrder)) orderNoInput.value = freshOrder;
          else orderNoInput.value = '';
          // On ticket change a missing name must CLEAR the field (Arabic/unknown) —
          // never leave the previous ticket's person in place.
          custNameInput.value = freshName || '';
          try { updateEmailPreview(); } catch (e) {}
          showToast('Ticket changed — Email details refreshed.', 'info');
        } catch (e) {}
      }, 1500);
    }

    rmsBtn.addEventListener('click', async () => {
      // Live-first (like the Email button): never serve a stale cached number.
      let orderNumber = '';
      try { orderNumber = extractOrderNumber() || ''; } catch (e) {}
      if (!orderNumber) {
        try { orderNumber = readCachedTicketOrder() || ''; } catch (e) {}
      }
      if (!orderNumber) {
        try { const st = await refreshTicketStore(false); orderNumber = (st && st.orderNumber) || ''; } catch (e) {}
      }
      if (!orderNumber || !isValidOrderNumber(orderNumber)) {
        showToast('Could not find a valid Order Number (format: 1234-567890123).', 'error');
        return;
      }
      const rmsUrl = `https://food-rms.breadfast.com/orders/list?page=1&limit=10&sortBy=placedAt&sortOrder=desc&search=${encodeURIComponent(orderNumber)}&searchBy=orderNumber&bf_autoclick=1`;
      showToast(`Opening RMS (Order #${orderNumber})...`, 'info');
      window.open(rmsUrl, '_blank', 'noopener,noreferrer');
    });

    // =========================================================================
    // SMS Dashboard Button
    // =========================================================================
    smsBtn.addEventListener('click', async () => {
      // Scroll to top so customer ID / order ID are visible before extraction
      await scrollToTicketTop();

      let customerId = extractCustomerId();
      let orderId = extractWpOrderId();

      // Kairos: Properties-tab leaves may be unmounted (sidepanel on another tab),
      // so refresh the central store (opens Properties tab if needed) for anything missing.
      if (isKairos && (!customerId || !orderId)) {
        try {
          const st = await refreshTicketStore(true);
          if (!customerId) customerId = (st && st.customerId) || extractCustomerId(false) || '';
          if (!orderId) orderId = (st && st.orderId) || '';
        } catch (e) {}
      }

      const smsUrl = `https://www.breadfast.com/dashboard/sms/create?orderId=${encodeURIComponent(orderId || '')}&&customerId=${encodeURIComponent(customerId || '')}`;

      if (customerId && orderId) {
        showToast(`Opening SMS Dashboard (Order #${orderId} - Customer #${customerId})...`, 'info');
      } else if (customerId) {
        showToast(`Opening SMS Dashboard (Customer #${customerId})...`, 'info');
      } else if (orderId) {
        showToast(`Opening SMS Dashboard (Order #${orderId})...`, 'info');
      } else {
        showToast('Opening SMS Dashboard...', 'info');
      }

      window.open(smsUrl, '_blank', 'noopener,noreferrer');
    });

    // =========================================================================
    // Tree Button & Cascading Flyout Menu (Ticket Actions - Calm Blue)
    // =========================================================================
    const treeBtn = createBtn('btn-tree-ticket', 'Tree', '#2563eb');
    treeBtn.title = 'New Ticket with Tree (Opens New Ticket Page)';
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
              { label: 'Dry' },
              { label: 'Soft' },
              { label: 'Eggy/Fishy smell' },
              { label: 'Chemical smell' },
              { label: 'Battery life' },
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
              { label: '# of product per pack less than promised' }
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
            label: 'Services/Order Timing',
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
              { label: 'Coupon used in undelivered order - cannot be used again' },
              { label: 'User cannot apply coupon' },
              { label: 'Not eligible to use the coupon' },
              { label: 'Misleading details' },
              { label: 'Instant discount coupon not reflected' },
              { label: 'Cashback coupon not reflected' }
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
              { label: 'Unsealed bag' },
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
          { label: 'BCard' }
        ]
      },
      {
        label: 'Internal Requests',
        children: [
          {
            label: 'Rider Support',
            children: [
              { label: 'Unreachable Customer' },
              { label: 'Out of zone address' },
              { label: 'Restaurant delay while dispatch' },
              { label: 'Order package messy' },
              { label: 'Customer Refuse To Receive' },
              { label: 'Customer challnages with payment' },
              { label: 'Customer Inappropriate Attitude' },
              { label: 'Customer Fraud' },
              { label: 'Customer Request to be called by CX' },
              { label: 'Customer requests cancellation while en route' },
              { label: 'Live OPS assistance' },
              { label: 'Other' }
            ]
          },
          {
            label: 'Restaurant Support',
            children: [
              { label: 'DA is late for pick-up' },
              { label: 'DA refused to receive order' },
              { label: 'Electricity Issue' },
              { label: 'Internet Issue' },
              { label: 'Kitchen Maintenance' },
              { label: 'System Crash' },
              { label: 'Unavailable Menu Item – Stock Issue' },
              { label: 'Duplicate Order' },
              { label: 'DA rude behavior' },
              { label: 'DA misuse of food' },
              { label: 'Pricing Issue or Description or Photo' },
              { label: 'Rider Picked Up wrong Order' },
              { label: 'Other' }
            ]
          }
        ]
      }
    ];

    // Add sleek dark scrollbar styles once to head
    if (!document.getElementById('bf-tree-menu-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'bf-tree-menu-styles';
      styleEl.textContent = `
        .bf-tree-menu::-webkit-scrollbar, .bf-sheets-menu::-webkit-scrollbar, .bf-system-menu::-webkit-scrollbar {
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

    closeAllTreeMenus = () => {
      if (typeof closeSystemMenu === 'function') closeSystemMenu();
      if (rootMenu) rootMenu.style.display = 'none';
      // Close submenus inside treeWrapper
      const allSubmenus = treeWrapper.querySelectorAll('.bf-tree-menu:not(.bf-tree-menu-root)');
      allSubmenus.forEach(sm => sm.style.display = 'none');
      // Also close any stray .bf-tree-menu anywhere in the document (position:fixed menus can escape wrapper)
      document.querySelectorAll('.bf-tree-menu').forEach(sm => {
        sm.style.display = 'none';
      });
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

            // Vertical positioning — ensure menu stays fully within viewport
            const viewH = window.innerHeight;
            const availableDown = viewH - rect.top - 10;
            const availableUp = rect.bottom - 10;
            // Dynamically cap maxHeight so menu never overflows viewport
            const dynamicMax = Math.max(200, viewH - 20);
            const effectiveMax = Math.min(380, dynamicMax);
            childMenu.style.maxHeight = `${effectiveMax}px`;
            const menuHeight = Math.min(childMenu.scrollHeight || effectiveMax, effectiveMax);

            let topPos;
            if (availableDown >= menuHeight) {
              // Enough room below the item
              topPos = rect.top - 4;
            } else if (availableUp >= menuHeight) {
              // Open upward from the bottom of the item
              topPos = rect.bottom - menuHeight + 4;
            } else {
              // Not enough room either way — fit to bottom of viewport
              topPos = Math.max(10, viewH - menuHeight - 10);
            }
            // Final clamp
            if (topPos + menuHeight > viewH - 10) {
              topPos = Math.max(10, viewH - menuHeight - 10);
            }
            if (topPos < 10) topPos = 10;
            childMenu.style.top = `${topPos}px`;
          };

          let hoverTimer = null;
          const openSubmenu = () => {
            listContainer.querySelectorAll('.bf-tree-item').forEach(sib => {
              if (sib !== itemEl && (!sib._childMenu || sib._childMenu.style.display === 'none')) {
                sib.style.backgroundColor = 'transparent';
              }
            });
            itemEl.style.backgroundColor = '#2563eb';
            positionAndShowChildMenu();
          };

          // Fast hover (50ms) auto-opens submenus for snappy navigation
          itemEl.addEventListener('mouseenter', () => {
            if (childMenu.style.display !== 'block') {
              itemEl.style.backgroundColor = '#334155';
              hoverTimer = setTimeout(() => {
                openSubmenu();
              }, 50);
            }
          });

          itemEl.addEventListener('mouseleave', () => {
            if (hoverTimer) {
              clearTimeout(hoverTimer);
              hoverTimer = null;
            }
            if (childMenu.style.display !== 'block') {
              itemEl.style.backgroundColor = 'transparent';
            }
          });

          // Click opens and locks the submenu open immediately
          itemEl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (hoverTimer) {
              clearTimeout(hoverTimer);
              hoverTimer = null;
            }
            if (childMenu.style.display === 'block') {
              closeSubmenusFromDepth(depth + 1);
              itemEl.style.backgroundColor = 'transparent';
            } else {
              openSubmenu();
            }
          });
        } else {
          // Leaf item - hovering closes deeper submenus smoothly
          let leafHoverTimer = null;
          itemEl.addEventListener('mouseenter', () => {
            itemEl.style.backgroundColor = '#334155';
            leafHoverTimer = setTimeout(() => {
              closeSubmenusFromDepth(depth + 1);
            }, 60);
          });
          itemEl.addEventListener('mouseleave', () => {
            if (leafHoverTimer) {
              clearTimeout(leafHoverTimer);
              leafHoverTimer = null;
            }
            itemEl.style.backgroundColor = 'transparent';
          });

          itemEl.addEventListener('click', async (e) => {
            e.stopPropagation();
            closeAllTreeMenus();

            const currentPath = [...path, item.label];
            const treeType = currentPath[0] || 'Complaints';
            const category = currentPath[1] || '';
            const detail = currentPath.length > 2 ? currentPath[2] : '';
            const subDetail = currentPath.length > 3 ? currentPath[3] : '';
            // Remember last tree so Create Ticket can reuse it when pressed directly.
            // Live-first (like the Email button): the store may hold a previous ticket's
            // number while the sidepanel already shows the current one.
            let savedOrderNo = '';
            try { savedOrderNo = extractOrderNumber() || ''; } catch (e) {}
            try { if (!savedOrderNo) savedOrderNo = readCachedTicketOrder() || ''; } catch (e) {}
            try { if (!savedOrderNo) { const st = await refreshTicketStore(false); savedOrderNo = (st && st.orderNumber) || ''; } } catch (e) {}
            // Order block may be collapsed/unloaded — hit Refresh and retry before saving
            if (!savedOrderNo) {
              try {
                const blk = Array.from(document.querySelectorAll('[data-testid="object-attribute"]')).find(el =>
                  !el.closest('#bf-custom-ticket-buttons, [data-testid="compose-form"]') && /order number/i.test(el.textContent || ''));
                const rb = blk?.querySelector('[data-testid="object-attribute-refresh"]');
                if (rb) {
                  rb.click();
                  await new Promise(r => setTimeout(r, 1200));
                  try { savedOrderNo = extractOrderNumber(true) || ''; } catch (e) {}
                }
              } catch (e) {}
            }
            try {
              let prevNo = '', prevTid = '';
              try {
                const pj = JSON.parse(localStorage.getItem('bf_last_tree') || 'null');
                prevNo = pj?.orderNumber || ''; prevTid = pj?.ticketId || '';
              } catch (e) {}
              let curTid = '';
              try { curTid = getCurrentTicketId() || ''; } catch (e) {}
              // ticket-specific: keep the saved number only for the SAME ticket
              const keepPrev = prevNo && prevTid && curTid && prevTid === curTid;
              localStorage.setItem('bf_last_tree', JSON.stringify({ treeType, category, detail, subDetail, orderNumber: savedOrderNo || (keepPrev ? prevNo : ''), ticketId: curTid }));
            } catch (e) {}

            const pathLabel = currentPath.slice(1).join(' > ');
            showToast(`[${treeType}] Selected: ${pathLabel}` + (savedOrderNo ? ` (Order #${savedOrderNo})` : ''), 'info');

            if (window.location.pathname.startsWith('/a/tickets/new')) {
              applyTreeToForm(treeType, category, detail, subDetail);
            } else {
              // Scroll to top so ticket fields (ID, order, UID) are visible before extraction
              await scrollToTicketTop();
              openTicketPage(treeBtn, 'Tree', {
                bf_tree_type: treeType,
                bf_category: category,
                bf_detail: detail,
                bf_sub_detail: subDetail,
                bf_order_number: savedOrderNo,
                bf_tree_choice: subDetail || detail || category
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
      if (typeof closeSystemMenu === 'function') {
        closeSystemMenu();
      }
      if (typeof closeAllSheetsMenus === 'function') {
        closeAllSheetsMenus();
      }
      if (typeof closeAllAutoFillMenus === 'function') {
        closeAllAutoFillMenus();
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
    // Auto Fill Button & Cascading Flyout Menu (Ticket Actions - Calm Blue)
    // Fills the Tree on the CURRENT ticket (ensuring Food Aggregation first)
    // =========================================================================
    const autoFillBtn = createBtn('btn-autofill-ticket', 'Auto Fill', '#2563eb');
    autoFillBtn.title = 'Auto Fill Current Ticket Tree (Food Aggregation, Type, Category, Details)';
    autoFillBtn.style.width = '100%';
    autoFillBtn.style.display = 'flex';
    autoFillBtn.style.justifyContent = 'center';
    autoFillBtn.style.alignItems = 'center';

    const autoFillWrapper = document.createElement('div');
    autoFillWrapper.id = 'bf-autofill-wrapper';
    autoFillWrapper.style.position = 'relative';
    autoFillWrapper.style.width = '100%';
    autoFillWrapper.appendChild(autoFillBtn);

    let autoFillRootMenu = null;
    const activeAutoFillSubmenusByDepth = {};

    closeAllAutoFillMenus = () => {
      if (typeof closeSystemMenu === 'function') closeSystemMenu();
      if (autoFillRootMenu) autoFillRootMenu.style.display = 'none';
      const allSubmenus = autoFillWrapper.querySelectorAll('.bf-tree-menu:not(.bf-tree-menu-root)');
      allSubmenus.forEach(sm => sm.style.display = 'none');
      Object.keys(activeAutoFillSubmenusByDepth).forEach(k => delete activeAutoFillSubmenusByDepth[k]);
      autoFillWrapper.querySelectorAll('.bf-tree-item').forEach(el => {
        el.style.backgroundColor = 'transparent';
      });
    };

    const closeAutoFillSubmenusFromDepth = (depth) => {
      Object.keys(activeAutoFillSubmenusByDepth).forEach(d => {
        if (parseInt(d, 10) >= depth) {
          if (activeAutoFillSubmenusByDepth[d]) {
            activeAutoFillSubmenusByDepth[d].style.display = 'none';
          }
          delete activeAutoFillSubmenusByDepth[d];
        }
      });
      autoFillWrapper.querySelectorAll('.bf-tree-item').forEach(el => {
        if (el._childMenu && el._childMenu.style.display === 'none') {
          el.style.backgroundColor = 'transparent';
        }
      });
    };

    const isTriggerDisabled = (tr) => {
      if (!tr) return true;
      if (tr.disabled || tr.hasAttribute('disabled')) return true;
      if (tr.getAttribute('aria-disabled') === 'true') return true;
      if (tr.classList.contains('ember-power-select-trigger--disabled')) return true;
      if (tr.classList.contains('disabled')) return true;
      const parent = tr.closest('.input, .__ui-form__select-field, .nested-fields, .nested-sub-fields, .nested-level-2-group, .nested-filter');
      if (parent && (parent.classList.contains('disabled') || parent.classList.contains('is-loading') || parent.getAttribute('aria-disabled') === 'true')) {
        return true;
      }
      return false;
    };

    const isDropdownOpen = (tr) => {
      if (!tr) return false;
      if (tr.getAttribute('aria-expanded') === 'true') return true;
      if (tr.classList.contains('ember-basic-dropdown-trigger--expanded') || tr.classList.contains('ember-power-select-trigger--active')) return true;
      const owns = tr.getAttribute('aria-owns') || tr.getAttribute('aria-controls');
      if (owns) {
        const content = document.getElementById(owns);
        if (content && !content.classList.contains('ember-basic-dropdown-content--closed') && content.style.display !== 'none') {
          return true;
        }
      }
      return false;
    };

    const clickElement = (el) => {
      if (!el) return;
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
        try {
          el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
        } catch (e) { }
      });
      try {
        if (typeof el.click === 'function') el.click();
      } catch (e) { }
    };

    const findFieldTriggerByLabel = (labelRegex) => {
      const candidates = Array.from(document.querySelectorAll('label, .control-label, .label-text, .label-field, [class*="label"], [data-test-label], .ember-power-select-placeholder'));
      for (const el of candidates) {
        const txt = (el.getAttribute('title') || el.textContent || '').trim().replace(/\s*\*\s*$/, '').trim();
        if (labelRegex.test(txt)) {
          // 1. Direct or inside el
          if (el.classList.contains('ember-power-select-trigger')) return el;
          const inside = el.querySelector('.ember-power-select-trigger');
          if (inside && document.body.contains(inside)) return inside;

          // 2. Check for attribute
          const forId = el.getAttribute('for');
          if (forId) {
            const target = document.getElementById(forId);
            if (target) {
              if (target.classList.contains('ember-power-select-trigger')) return target;
              const tr = target.querySelector('.ember-power-select-trigger');
              if (tr && document.body.contains(tr)) return tr;
            }
          }

          // 3. Following sibling elements of label
          let sib = el.nextElementSibling;
          while (sib) {
            if (sib.classList.contains('ember-power-select-trigger')) return sib;
            const tr = sib.querySelector('.ember-power-select-trigger');
            if (tr && document.body.contains(tr)) return tr;
            sib = sib.nextElementSibling;
          }

          // 4. Traverse parent hierarchy, checking siblings and children
          let parent = el.parentElement;
          let depth = 0;
          while (parent && parent !== document.body && depth < 5) {
            if (parent.id === 'ticket-properties' || parent.classList.contains('ticket-properties') || parent.classList.contains('sidebar-content') || parent.tagName === 'FORM') {
              break;
            }
            const triggers = Array.from(parent.querySelectorAll('.ember-power-select-trigger'));
            if (triggers.length === 1 && document.body.contains(triggers[0])) {
              return triggers[0];
            }
            if (triggers.length > 1) {
              // Return the first trigger that appears AFTER this label in DOM
              for (const tr of triggers) {
                if (el.compareDocumentPosition(tr) & Node.DOCUMENT_POSITION_FOLLOWING) {
                  return tr;
                }
              }
            }
            let pSib = parent.nextElementSibling;
            if (pSib) {
              if (pSib.classList.contains('ember-power-select-trigger')) return pSib;
              const tr = pSib.querySelector('.ember-power-select-trigger');
              if (tr && document.body.contains(tr)) return tr;
            }
            parent = parent.parentElement;
            depth++;
          }
        }
      }
      return null;
    };

    const getDropdownFollowing = (referenceTrigger) => {
      if (!referenceTrigger) return null;
      const root = referenceTrigger.closest('#ticket-properties, .ticket-properties, .sidebar-content, form, body') || document.body;
      const allTriggers = Array.from(root.querySelectorAll('.ember-power-select-trigger'));
      const idx = allTriggers.indexOf(referenceTrigger);
      if (idx !== -1 && idx + 1 < allTriggers.length) {
        return allTriggers[idx + 1];
      }
      return null;
    };

    const getLiveTypeTrigger = () => {
      let tr = document.querySelector(
        '[data-test-id*="properties-ticket_type" i] .ember-power-select-trigger, ' +
        '[data-test-id*="properties-type" i] .ember-power-select-trigger, ' +
        '[data-test-id*="tkt-properties-ticket_type" i] .ember-power-select-trigger, ' +
        '[data-test-id*="tkt-properties-type" i] .ember-power-select-trigger, ' +
        '[data-test-id="ticket-type" i] .ember-power-select-trigger, ' +
        '[data-test-id="type" i] .ember-power-select-trigger'
      );
      if (!tr) {
        tr = findFieldTriggerByLabel(/^type$|^ticket\s*type$/i);
      }
      return tr;
    };

    const getLiveBusinessUnitTrigger = () => {
      let tr = document.querySelector(
        '[data-test-id*="cf_business_unit" i] .ember-power-select-trigger, ' +
        '[data-test-id*="business_unit" i] .ember-power-select-trigger, ' +
        '[data-test-id*="tkt-properties-cf_business_unit" i] .ember-power-select-trigger'
      );
      if (!tr) {
        tr = findFieldTriggerByLabel(/business\s*unit/i);
      }
      return tr;
    };

    const getLiveFeedbackTypeTrigger = () => findDropdownTrigger('Feedback Type');
    const getLiveFeedbackCategoryTrigger = () => findDropdownTrigger('Feedback');
    const getLiveFeedbackDetailsTrigger = () => findDropdownTrigger('Feedback Details');

    const getLiveLevel1Trigger = (treeType = '') => {
      const typeLow = (treeType || '').toLowerCase();
      const isFb = typeLow.includes('feedback');
      const isInternal = typeLow.includes('internal');

      if (isInternal) {
        // 1. Internal Requests L1 (Internal Request Type)
        const tr = document.querySelector(
          '[data-test-id*="internal_request_type" i] .ember-power-select-trigger, ' +
          '[data-test-id*="cf_internal_request_type" i] .ember-power-select-trigger, ' +
          '[data-test-id*="cf_internal_type" i] .ember-power-select-trigger, ' +
          '[data-test-id="level-1"] .ember-power-select-trigger'
        );
        if (tr) return tr;

        const byLabel = findFieldTriggerByLabel(/^internal\s*request\s*type$/i) ||
                        findFieldTriggerByLabel(/internal\s*request\s*type/i);
        if (byLabel) return byLabel;

        const typeTr = getLiveTypeTrigger();
        if (typeTr) {
          const nextTr = getDropdownFollowing(typeTr);
          if (nextTr) return nextTr;
        }
      } else if (isFb) {
        // 2. Feedback L1 (Feedback Type)
        const tr = getLiveFeedbackTypeTrigger();
        if (tr) return tr;
      } else {
        // 3. Complaints L1 (Complaint Category Food Agg)
        // Direct scoped selectors for Food Agg Category
        const tr = document.querySelector(
          '[data-test-id*="cf_complaint_category_food_agg" i] .ember-power-select-trigger, ' +
          '[title*="Complaint Category Food Agg" i] ~ .ember-power-select-trigger, ' +
          '[title*="Complaint Category Food Agg" i] .ember-power-select-trigger, ' +
          '[data-test-id*="complaint_category_food_agg" i] .ember-power-select-trigger'
        );
        if (tr) return tr;

        // Selectors strictly avoiding buddy
        const candTrs = Array.from(document.querySelectorAll(
          '[data-test-id*="complaint_category" i], [data-test-id*="cf_complaint_category" i], [title*="Complaint Category" i]'
        ));
        for (const el of candTrs) {
          const attr = ((el.getAttribute('data-test-id') || '') + ' ' + (el.getAttribute('title') || '')).toLowerCase();
          if (!attr.includes('buddy')) {
            const trigger = el.classList.contains('ember-power-select-trigger') ? el : el.querySelector('.ember-power-select-trigger');
            if (trigger) return trigger;
          }
        }

        // Label matching (strict: must NOT match Buddy)
        const byLabel = findFieldTriggerByLabel(/complaint\s*category.*food\s*agg/i) ||
                        findFieldTriggerByLabel(/^complaint\s*category$/i);
        if (byLabel) return byLabel;
      }

      return document.querySelector(
        '[data-test-id*="cf_complaint_category_food_agg" i] .ember-power-select-trigger, ' +
        '[data-test-id="level-1"] .ember-power-select-trigger, ' +
        '[data-test-id*="cf_complaint_category" i] .ember-power-select-trigger, ' +
        '[data-test-id*="cf_feedback_category" i] .ember-power-select-trigger'
      );
    };

    const getLiveLevel2Trigger = (treeType = '') => {
      const typeLow = (treeType || '').toLowerCase();
      const isFb = typeLow.includes('feedback');
      const isInternal = typeLow.includes('internal');

      if (isInternal) {
        // 1. Internal Requests L2 (Internal Request Details)
        const tr = document.querySelector(
          '[data-test-id*="internal_request_detail" i] .ember-power-select-trigger, ' +
          '[data-test-id*="cf_internal_request_detail" i] .ember-power-select-trigger, ' +
          '[data-test-id*="cf_internal_request" i]:not([data-test-id*="type" i]) .ember-power-select-trigger, ' +
          '[data-test-id*="internal_request" i]:not([data-test-id*="type" i]) .ember-power-select-trigger, ' +
          '.nested-level-2-group .ember-power-select-trigger, ' +
          '.nested-sub-fields [data-test-id="level-2"] .ember-power-select-trigger, ' +
          '[data-test-id="level-2"] .ember-power-select-trigger'
        );
        if (tr) return tr;

        const byLabel = findFieldTriggerByLabel(/^internal\s*request$/i) ||
                        findFieldTriggerByLabel(/^internal\s*request(?:\s*(?:detail|sub|issue|reason))?$/i);
        if (byLabel) return byLabel;

        const l1Tr = getLiveLevel1Trigger(treeType);
        if (l1Tr) {
          const nextTr = getDropdownFollowing(l1Tr);
          if (nextTr) return nextTr;
        }
      } else if (isFb) {
        // 2. Feedback L2 (Feedback Category / Feedback)
        const tr = getLiveFeedbackCategoryTrigger();
        if (tr) return tr;
      } else {
        // 3. Complaints L2 (Complaint Details Food Agg)
        const l1Tr = getLiveLevel1Trigger(treeType);

        // A. Primary: Check findDropdownTrigger('Complaint Details')
        const fdTr = findDropdownTrigger('Complaint Details');
        if (fdTr && document.body.contains(fdTr) && fdTr !== l1Tr) return fdTr;

        // B. Direct scoped selectors for Food Agg Details (MUST NOT be l1Tr)
        const directSelectors = [
          '[data-test-id*="Complaint Details Food Agg" i] .ember-power-select-trigger',
          '[data-test-id*="cf_complaint_details_food_agg" i] .ember-power-select-trigger',
          '[data-test-id*="complaint_details_food_agg" i] .ember-power-select-trigger',
          '[title*="Complaint Details Food Agg" i] ~ .ember-power-select-trigger',
          '[title*="Complaint Details Food Agg" i] .ember-power-select-trigger',
          '.nested-sub-fields [data-test-id="level-2"] .ember-power-select-trigger',
          '.nested-fields [data-test-id="level-2"] .ember-power-select-trigger',
          '[data-test-id="level-2"] .ember-power-select-trigger'
        ];
        for (const sel of directSelectors) {
          const el = document.querySelector(sel);
          if (el && document.body.contains(el) && el !== l1Tr) return el;
        }

        // C. Check nested field container 2nd trigger
        const nestedContainer = document.querySelector('.nested-sub-fields, .nested-fields, .nested-field-group, [data-test-id*="nested" i]');
        if (nestedContainer) {
          const triggers = Array.from(nestedContainer.querySelectorAll('.ember-power-select-trigger'));
          if (triggers.length >= 2 && triggers[1] !== l1Tr && document.body.contains(triggers[1])) {
            return triggers[1];
          }
        }

        // D. Selectors strictly avoiding buddy and l1Tr
        const candTrs = Array.from(document.querySelectorAll(
          '[data-test-id*="complaint_details" i], [data-test-id*="cf_complaint_details" i], [title*="Complaint Details" i], [data-test-id*="sub_category" i], [title*="Sub Category" i]'
        ));
        for (const el of candTrs) {
          const attr = ((el.getAttribute('data-test-id') || '') + ' ' + (el.getAttribute('title') || '')).toLowerCase();
          if (!attr.includes('buddy')) {
            const trigger = el.classList.contains('ember-power-select-trigger') ? el : el.querySelector('.ember-power-select-trigger');
            if (trigger && document.body.contains(trigger) && trigger !== l1Tr) return trigger;
          }
        }

        // E. Label matching (strict: must NOT match Buddy and must not be l1Tr)
        const byLabel = findFieldTriggerByLabel(/complaint\s*detail.*food\s*agg/i) ||
                        findFieldTriggerByLabel(/^complaint\s*details?$/i) ||
                        findFieldTriggerByLabel(/^sub\s*category$/i);
        if (byLabel && byLabel !== l1Tr) return byLabel;

        // F. Dropdown immediately following Level 1
        if (l1Tr) {
          const nextTr = getDropdownFollowing(l1Tr);
          if (nextTr && nextTr !== l1Tr && document.body.contains(nextTr)) return nextTr;
        }
      }

      return null;
    };

    const getLiveLevel3Trigger = (treeType = '') => {
      const typeLow = (treeType || '').toLowerCase();
      if (typeLow.includes('feedback')) {
        return getLiveFeedbackDetailsTrigger();
      }
      const byLabel = findFieldTriggerByLabel(/^quality$/i);
      if (byLabel) return byLabel;
      return document.querySelector(
        '[data-test-id="level-3"] .ember-power-select-trigger, ' +
        '[data-test-id*="quality" i] .ember-power-select-trigger, ' +
        '.nested-sub-fields [data-test-id="level-3"] .ember-power-select-trigger'
      );
    };

    const setDropdownValue = async (getTriggerFn, targetValue, maxWaitMs = 5000) => {
      if (!getTriggerFn || !targetValue) return false;
      const myToken = currentAutomationToken;
      const isAborted = () => myToken !== currentAutomationToken;

      const norm = (s) => (s || '').trim().toLowerCase()
        .replace(/resturant/g, 'restaurant')
        .replace(/requests/g, 'request')
        .replace(/challnages/g, 'challenges');

      const target = norm(targetValue);
      const targetClean = target.replace(/[^a-z0-9]/g, '');

      const isAlreadySelected = (tr) => {
        if (!tr) return false;
        if (tr.querySelector('.ember-power-select-placeholder')) return false;

        const selectedEl = tr.querySelector('.ember-power-select-selected-item, .trigger-power-select, .ember-power-select-trigger-string, [data-test-id*="selected-item"]');
        const curText = norm((selectedEl ? selectedEl.textContent : tr.textContent) || '');
        if (!curText || curText === '--' || curText === 'any' || curText.startsWith('select') || curText.includes('choose') || curText.startsWith('any')) {
          return false;
        }
        const curClean = curText.replace(/[^a-z0-9]/g, '');
        if (!curClean || curClean === 'any') return false;

        if (curClean === targetClean || curText === target) return true;
        if (curClean.length >= 4 && targetClean.length >= 4 && (curClean.startsWith(targetClean) || targetClean.startsWith(curClean) || curClean.includes(targetClean))) {
          return true;
        }
        return false;
      };

      // Fast-path: Check immediately if trigger exists and already selected
      let trigger = getTriggerFn();
      if (trigger && isAlreadySelected(trigger)) {
        return true;
      }

      const dispatchClick = (el) => {
        if (!el) return;
        ['mousedown', 'mouseup', 'click'].forEach(type => {
          try {
            el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0 }));
          } catch (e) { }
        });
        try {
          if (typeof el.click === 'function') el.click();
        } catch (e) { }
      };

      const startWait = Date.now();
      // 1. Wait for trigger to be rendered, attached to DOM, and NOT disabled
      while (Date.now() - startWait < maxWaitMs) {
        if (isAborted()) return false;
        trigger = getTriggerFn();
        if (trigger && document.body.contains(trigger) && !isTriggerDisabled(trigger)) {
          break;
        }
        await new Promise(r => setTimeout(r, 25));
      }

      if (isAborted()) return false;
      if (!trigger || !document.body.contains(trigger)) {
        console.log(`[Auto Fill] Trigger for "${targetValue}" not found or remained disabled.`);
        return false;
      }

      if (isAlreadySelected(trigger)) {
        return true;
      }

      const getActiveDropdownContent = () => {
        const liveTr = getTriggerFn() || trigger;
        if (liveTr) {
          const owns = liveTr.getAttribute('aria-owns') || liveTr.getAttribute('aria-controls');
          if (owns) {
            const el = document.getElementById(owns);
            if (el && !el.classList.contains('ember-basic-dropdown-content--closed')) return el;
          }
          const trId = liveTr.id;
          if (trId) {
            const el = document.getElementById(`ember-basic-dropdown-content-${trId}`) ||
                       document.getElementById(trId.replace('trigger', 'content')) ||
                       document.querySelector(`[data-ebd-id="${trId}"]`);
            if (el && !el.classList.contains('ember-basic-dropdown-content--closed')) return el;
          }
        }
        const openContents = Array.from(document.querySelectorAll(
          '.ember-basic-dropdown-content:not(.ember-basic-dropdown-content--closed)'
        ));
        const visible = openContents.find(el => el.offsetParent !== null && el.getBoundingClientRect().height > 0);
        return visible || (openContents.length > 0 ? openContents[openContents.length - 1] : null);
      };

      const getSearchInput = () => {
        const liveTr = getTriggerFn() || trigger;
        if (liveTr) {
          const inp = liveTr.querySelector('input.ember-power-select-search-input, input[type="search"], input[type="text"], input');
          if (inp && !inp.disabled) return inp;
        }
        const content = getActiveDropdownContent();
        if (content) {
          const inp = content.querySelector('input.ember-power-select-search-input, input[type="search"], input[type="text"], input');
          if (inp && !inp.disabled) return inp;
        }
        return document.querySelector('.ember-basic-dropdown-content:not(.ember-basic-dropdown-content--closed) input, .ember-power-select-trigger--active input');
      };

      const fillSearch = (inp, text) => {
        if (!inp) return;
        try { inp.focus(); } catch (e) { }
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (nativeSetter) nativeSetter.call(inp, text);
        else inp.value = text;
        inp.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          inp.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ch }));
          inp.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, key: ch }));
          inp.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ch }));
        }
      };

      // 2. Open dropdown and find matching option
      const startFind = Date.now();
      let lastClickTime = 0;
      let searched = 0;
      let openCycles = 0;

      while (Date.now() - startFind < maxWaitMs) {
        if (isAborted()) return false;
        const liveTr = getTriggerFn();
        if (liveTr && document.body.contains(liveTr)) {
          trigger = liveTr;
        }

        if (isAlreadySelected(trigger)) {
          return true;
        }

        if (isTriggerDisabled(trigger)) {
          await new Promise(r => setTimeout(r, 40));
          continue;
        }

        const open = isDropdownOpen(trigger);

        // If dropdown closed or hasn't opened yet, open it
        if (!open && Date.now() - lastClickTime > 200) {
          lastClickTime = Date.now();
          dispatchClick(trigger);
          await new Promise(r => setTimeout(r, 50));
          continue;
        }

        // Active dropdown content
        const activeContent = getActiveDropdownContent();
        let allOptions = [];
        if (activeContent) {
          allOptions = Array.from(activeContent.querySelectorAll('.ember-power-select-option, [role="option"]'));
        }
        if (!allOptions || allOptions.length === 0) {
          allOptions = Array.from(document.querySelectorAll(
            '.ember-basic-dropdown-content:not(.ember-basic-dropdown-content--closed) .ember-power-select-option, ' +
            '.ember-basic-dropdown-content:not(.ember-basic-dropdown-content--closed) [role="option"]'
          ));
        }

        const hasLoadingMsg = allOptions.some(o => o.classList.contains('ember-power-select-option--loading-message'));
        if (hasLoadingMsg) {
          await new Promise(r => setTimeout(r, 40));
          continue;
        }

        const validOptions = allOptions.filter(o => {
          return !o.classList.contains('ember-power-select-option--loading-message') &&
                 !o.classList.contains('ember-power-select-option--no-matches-message');
        });

        // 1. Exact or clean match
        let match = validOptions.find(o => {
          const t = norm(o.textContent);
          if (!t || t === '--' || t === 'any' || t.startsWith('select') || t.includes('choose')) return false;
          const tClean = t.replace(/[^a-z0-9]/g, '');
          return t === target || tClean === targetClean;
        });

        // 2. Segmented / parts match (e.g. "Over cooked / burnt" vs "Over cooked")
        if (!match) {
          match = validOptions.find(o => {
            const t = norm(o.textContent);
            if (!t || t === '--' || t === 'any' || t.startsWith('select') || t.includes('choose')) return false;
            const segments = t.split(/[/\\&>-]/).map(p => p.trim().replace(/[^a-z0-9]/g, ''));
            return segments.some(p => p === targetClean || (p.length >= 3 && targetClean.length >= 3 && (p.includes(targetClean) || targetClean.includes(p))));
          });
        }

        // 3. Clean string includes or startsWith
        if (!match) {
          match = validOptions.find(o => {
            const t = norm(o.textContent);
            if (!t || t === '--' || t === 'any' || t.startsWith('select') || t.includes('choose')) return false;
            const tClean = t.replace(/[^a-z0-9]/g, '');
            return (tClean.length >= 3 && targetClean.length >= 3) &&
                   (tClean.includes(targetClean) || targetClean.includes(tClean) || tClean.startsWith(targetClean) || targetClean.startsWith(tClean));
          });
        }

        // 4. Substring match
        if (!match) {
          match = validOptions.find(o => {
            const t = norm(o.textContent);
            if (!t || t === '--' || t === 'any' || t.startsWith('select') || t.includes('choose')) return false;
            return t.includes(target) || target.includes(t);
          });
        }

        if (match) {
          const list = match.closest('.ember-power-select-options, ul');
          if (list) {
            try { list.scrollTop = match.offsetTop - list.offsetTop; } catch (e) { }
          }
          try { match.scrollIntoView({ block: 'nearest' }); } catch (e) { }

          const sInp = getSearchInput();

          try {
            match.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1 }));
            match.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1 }));
            match.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, view: window, button: 0, buttons: 0 }));
            match.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, button: 0, buttons: 0 }));
            match.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, button: 0, buttons: 0 }));
            if (typeof match.click === 'function') match.click();
          } catch (e) { }

          if (sInp) {
            try {
              sInp.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 }));
              sInp.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 }));
            } catch (e) { }
          }

          // Check if selection registered on option or trigger
          await new Promise(r => setTimeout(r, 60));

          const isSelectedNow = () => {
            const postTr = getTriggerFn() || trigger;
            if (isAlreadySelected(postTr)) return true;
            if (match) {
              if (match.getAttribute('aria-selected') === 'true') return true;
              if (match.classList.contains('ember-power-select-option--selected')) return true;
              if (match.querySelector('.checked, svg, [data-icon*="check"]')) return true;
            }
            return false;
          };

          if (isSelectedNow()) {
            closeHangingDropdowns();
            await new Promise(r => setTimeout(r, 40));
            return true;
          }

          const confirmStart = Date.now();
          while (Date.now() - confirmStart < 400) {
            if (isAborted()) return false;
            await new Promise(r => setTimeout(r, 35));
            if (isSelectedNow()) {
              closeHangingDropdowns();
              await new Promise(r => setTimeout(r, 40));
              return true;
            }
          }

          closeHangingDropdowns();
          await new Promise(r => setTimeout(r, 40));
          return true;
        }

        // If open and match not found after 150ms, try typing in search input (in trigger or content)
        if (Date.now() - startFind > 150 && searched === 0 && open) {
          searched = 1;
          const searchInput = getSearchInput();
          if (searchInput) {
            fillSearch(searchInput, targetValue);
            await new Promise(r => setTimeout(r, 80));
            continue;
          }
        }

        // If still not matched after 650ms, try searching with first word
        if (Date.now() - startFind > 650 && searched === 1 && open) {
          searched = 2;
          const firstWord = targetValue.split(/\s+/)[0];
          if (firstWord && firstWord !== targetValue) {
            const searchInput = getSearchInput();
            if (searchInput) {
              fillSearch(searchInput, firstWord);
              await new Promise(r => setTimeout(r, 80));
              continue;
            }
          }
        }

        // If dropdown is open for over 900ms without match, toggle close and reopen to refresh options from Ember store
        if (open && !match && Date.now() - lastClickTime > 900 && openCycles < 2) {
          openCycles++;
          lastClickTime = Date.now();
          dispatchClick(trigger);
          await new Promise(r => setTimeout(r, 80));
          dispatchClick(trigger);
          await new Promise(r => setTimeout(r, 80));
          continue;
        }

        await new Promise(r => setTimeout(r, 35));
      }

      await new Promise(r => setTimeout(r, 50));
      closeHangingDropdowns();
      const finalTr = getTriggerFn() || trigger;
      return isAlreadySelected(finalTr);
    };

    const executeAutoFillTree = async (treeType, category, detail, subDetail = '') => {
      const ok = await applyTreeToForm(treeType, category, detail, subDetail);
      if (ok) {
        // Success toast suppressed — only show errors
      }
    };

    const buildAutoFillSubmenu = (items, isRoot = false, path = [], depth = 0) => {
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

      const listContainer = document.createElement('div');
      listContainer.className = 'bf-tree-list-container';
      listContainer.style.display = 'flex';
      listContainer.style.flexDirection = 'column';
      listContainer.style.gap = '2px';
      listContainer.style.width = '100%';
      menu.appendChild(listContainer);

      items.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'bf-tree-item';
        itemEl.style.padding = '5px 8px';
        itemEl.style.borderRadius = '5px';
        itemEl.style.cursor = 'pointer';
        itemEl.style.display = 'flex';
        itemEl.style.justifyContent = 'space-between';
        itemEl.style.alignItems = 'center';
        itemEl.style.transition = 'background-color 0.15s';
        itemEl.style.whiteSpace = 'nowrap';
        itemEl.style.fontSize = '11.5px';

        const labelSpan = document.createElement('span');
        labelSpan.textContent = item.label;
        labelSpan.style.overflow = 'hidden';
        labelSpan.style.textOverflow = 'ellipsis';
        labelSpan.style.paddingRight = '6px';
        itemEl.appendChild(labelSpan);

        if (item.children && item.children.length > 0) {
          const arrowSpan = document.createElement('span');
          arrowSpan.className = 'bf-tree-arrow';
          arrowSpan.textContent = currentSide === 'right' ? '◂' : '▸';
          arrowSpan.style.fontSize = '9px';
          arrowSpan.style.opacity = '0.7';
          arrowSpan.style.flexShrink = '0';
          itemEl.appendChild(arrowSpan);

          const childMenu = buildAutoFillSubmenu(item.children, false, [...path, item.label], depth + 1);
          autoFillWrapper.appendChild(childMenu);
          itemEl._childMenu = childMenu;

          const positionAndShowChildMenu = () => {
            closeAutoFillSubmenusFromDepth(depth + 1);
            activeAutoFillSubmenusByDepth[depth + 1] = childMenu;

            const rect = itemEl.getBoundingClientRect();
            childMenu.style.display = 'block';

            const childWidth = 240;
            if (currentSide === 'right') {
              let targetLeft = rect.left - childWidth - 6;
              if (targetLeft < 10) targetLeft = rect.right + 6;
              childMenu.style.left = `${Math.round(targetLeft)}px`;
            } else {
              let targetLeft = rect.right + 6;
              if (targetLeft + childWidth > window.innerWidth - 10) {
                targetLeft = rect.left - childWidth - 6;
              }
              childMenu.style.left = `${Math.round(targetLeft)}px`;
            }

            let top = rect.top - 4;
            const menuHeight = 350;
            if (top + menuHeight > window.innerHeight - 15) {
              top = Math.max(10, window.innerHeight - menuHeight - 15);
            }
            childMenu.style.top = `${Math.round(top)}px`;
          };

          let hoverTimer = null;
          const openSubmenu = () => {
            listContainer.querySelectorAll('.bf-tree-item').forEach(sib => {
              if (sib !== itemEl && (!sib._childMenu || sib._childMenu.style.display === 'none')) {
                sib.style.backgroundColor = 'transparent';
              }
            });
            itemEl.style.backgroundColor = '#2563eb';
            positionAndShowChildMenu();
          };

          // Fast hover (50ms) auto-opens submenus for snappy navigation
          itemEl.addEventListener('mouseenter', () => {
            if (childMenu.style.display !== 'block') {
              itemEl.style.backgroundColor = '#334155';
              hoverTimer = setTimeout(() => {
                openSubmenu();
              }, 50);
            }
          });

          itemEl.addEventListener('mouseleave', () => {
            if (hoverTimer) {
              clearTimeout(hoverTimer);
              hoverTimer = null;
            }
            if (childMenu.style.display !== 'block') {
              itemEl.style.backgroundColor = 'transparent';
            }
          });

          // Click opens and locks the submenu open immediately
          itemEl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (hoverTimer) {
              clearTimeout(hoverTimer);
              hoverTimer = null;
            }
            if (childMenu.style.display === 'block') {
              closeAutoFillSubmenusFromDepth(depth + 1);
              itemEl.style.backgroundColor = 'transparent';
            } else {
              openSubmenu();
            }
          });
        } else {
          // Leaf item - hovering closes deeper submenus smoothly
          let leafHoverTimer = null;
          itemEl.addEventListener('mouseenter', () => {
            itemEl.style.backgroundColor = '#334155';
            leafHoverTimer = setTimeout(() => {
              closeAutoFillSubmenusFromDepth(depth + 1);
            }, 60);
          });
          itemEl.addEventListener('mouseleave', () => {
            if (leafHoverTimer) {
              clearTimeout(leafHoverTimer);
              leafHoverTimer = null;
            }
            itemEl.style.backgroundColor = 'transparent';
          });

          itemEl.addEventListener('click', async (e) => {
            e.stopPropagation();
            closeAllAutoFillMenus();

            // Scroll to top so ticket fields are visible before auto-fill extraction
            await scrollToTicketTop();

            const currentPath = [...path, item.label];
            const treeType = currentPath[0] || 'Complaints';
            const category = currentPath[1] || '';
            const detail = currentPath.length > 2 ? currentPath[2] : '';
            const subDetail = currentPath.length > 3 ? currentPath[3] : '';
            // Remember last tree so Create Ticket can reuse it when pressed directly
            try {
              let afOrder = '';
              try { afOrder = extractOrderNumber() || ''; } catch (e) {}
              if (!afOrder) { try { afOrder = readCachedTicketOrder(); } catch (e) {} }
              if (!afOrder) {
                try {
                  const blk = Array.from(document.querySelectorAll('[data-testid="object-attribute"]')).find(el =>
                    !el.closest('#bf-custom-ticket-buttons, [data-testid="compose-form"]') && /order number/i.test(el.textContent || ''));
                  const rb = blk?.querySelector('[data-testid="object-attribute-refresh"]');
                  if (rb) {
                    rb.click();
                    await new Promise(r => setTimeout(r, 1200));
                    try { afOrder = extractOrderNumber(true) || ''; } catch (e) {}
                  }
                } catch (e) {}
              }
              let afPrev = '', afPrevTid = '';
              try {
                const apj = JSON.parse(localStorage.getItem('bf_last_tree') || 'null');
                afPrev = apj?.orderNumber || ''; afPrevTid = apj?.ticketId || '';
              } catch (e) {}
              let afCurTid = '';
              try { afCurTid = getCurrentTicketId() || ''; } catch (e) {}
              const afKeep = afPrev && afPrevTid && afCurTid && afPrevTid === afCurTid;
              localStorage.setItem('bf_last_tree', JSON.stringify({ treeType, category, detail, subDetail, orderNumber: afOrder || (afKeep ? afPrev : ''), ticketId: afCurTid }));
            } catch (e) {}

            const pathLabel = currentPath.slice(1).join(' > ');
            showToast(`Auto Filling: ${treeType} > ${pathLabel}...`, 'info');
            executeAutoFillTree(treeType, category, detail, subDetail);
          });
        }

        listContainer.appendChild(itemEl);
      });

      return menu;
    };

    autoFillRootMenu = buildAutoFillSubmenu(treeData, true, []);
    autoFillWrapper.appendChild(autoFillRootMenu);

    autoFillBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof closeSystemMenu === 'function') closeSystemMenu();
      if (typeof closeAllTreeMenus === 'function') closeAllTreeMenus();
      if (typeof closeAllSheetsMenus === 'function') closeAllSheetsMenus();
      const isOpen = autoFillRootMenu.style.display === 'block';
      if (isOpen) {
        closeAllAutoFillMenus();
      } else {
        closeAllAutoFillMenus();
        autoFillRootMenu.style.display = 'block';
      }
    });

    document.addEventListener('click', (e) => {
      if (!autoFillWrapper.contains(e.target)) {
        closeAllAutoFillMenus();
      }
    });

    updateAutoFillMenuPosition = (side) => {
      if (!autoFillRootMenu) return;
      if (side === 'right') {
        autoFillRootMenu.style.right = 'calc(100% + 8px)';
        autoFillRootMenu.style.left = 'auto';
      } else {
        autoFillRootMenu.style.left = 'calc(100% + 8px)';
        autoFillRootMenu.style.right = 'auto';
      }
      const arrows = autoFillWrapper.querySelectorAll('.bf-tree-arrow');
      arrows.forEach(ar => {
        ar.textContent = side === 'right' ? '◂' : '▸';
      });
      closeAllAutoFillMenus();
    };

    updateAutoFillMenuPosition(currentSide);

    // =========================================================================
    // Sheets Button & Cascading Flyout Menu (KB & Shifts)
    // =========================================================================
    const sheetsBtn = createBtn('btn-sheets-menu', 'Sheets', '#7c3aed');
    sheetsBtn.title = 'Google Sheets & Forms Shortcuts (KB, Shift forms, Other sheets)';
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
      kb_rating: 'https://docs.google.com/spreadsheets/d/1qJBXU8k_t7GgcGegzhdDsMqkyZDrvuhDbYRPIad25sk/edit?pli=1&gid=0#gid=0',
      kb_reopened: 'https://docs.google.com/spreadsheets/d/1LzfAFLWplqdtly-gVwz4AFjhawwhkSN3vZi-iHXsaTg/edit?pli=1&gid=207913064#gid=207913064',
      kb_retention: 'https://docs.google.com/spreadsheets/d/1phbOrYG0t8ea_K4qO86eIsfk_IVq1uG8JR7_3w_og90/htmlview?pli=1#gid=475268211',
      kb_rider: 'https://docs.google.com/spreadsheets/d/11d6VMGif0175bzHGkYMffywbZS6oJrS2tW0tPJQu-cI/edit?gid=1998717658#gid=1998717658',
      kb_restaurant: 'https://docs.google.com/spreadsheets/d/1H-veWjDFNZq0abj4bSK7cLjYAJrCCuUmgSdDEWT19Hg/edit?gid=1998717658#gid=1998717658',
      kb_chat: 'https://docs.google.com/spreadsheets/d/17bnnu7cWnM6v4n_yHo2-gNK2xgVOpFOuO0r1TEYNjxs/edit?gid=402216287#gid=402216287',
      shifts_swap_shift: 'https://forms.gle/gn5nRzJra7KuGUEu7',
      shifts_swap_off: 'https://forms.gle/h36ahHieaxQt9Pme6',
      shifts_off_queue: 'https://forms.gle/vomT2VU9p5qe2vBr9',
      shifts_late: 'https://docs.google.com/forms/d/e/1FAIpQLSdXf3bPbGxBB2zTzZMZlew6pyPjYVVtHDrFimNtw7hLF7-QKw/viewform',
      shifts_vacation: 'https://forms.gle/ywCWYJ7jSXdz5rmq8',
      other_agent_view: 'https://docs.google.com/spreadsheets/d/130vrNrMBOyVjIYfzUBhmbc_hzdfLiHKkBLYlOtchRRE/edit?gid=1597923501#gid=1597923501',
      other_email_templates: 'https://docs.google.com/document/d/1pD1azNjn2PeNx2sDQQNxDuhXVvLoGdP2XJpUYP7vohM/edit?pli=1&tab=t.0',
      other_map: 'https://www.google.com/maps/d/u/0/viewer?ll=30.035282403089514%2C31.383135323902362&z=12&mid=1s-ecYuJYk9BV8utlc7CjJTeGI2O4q-M',
      other_abuser_form: 'https://docs.google.com/forms/d/e/1FAIpQLSdSQ85y36IkviLADoxLYjA9xlayUQ3QdnIc2UgbiHi0iGMeIw/viewform?pli=1',
      other_abuser_responses: 'https://docs.google.com/spreadsheets/d/1bPzCxTxk8IR4ghpvlPyFP6XSDzEammxZOLJLqJUTHbU/edit?resourcekey=&gid=420644289#gid=420644289'
    };

    // Custom Links Storage Helpers
    const getStoredCustomLinks = (callback) => {
      let handled = false;
      const fallbackLocal = () => {
        if (handled) return;
        handled = true;
        try {
          const val = JSON.parse(localStorage.getItem('bf_custom_sheets_links') || '[]');
          callback(Array.isArray(val) ? val : []);
        } catch (e) {
          callback([]);
        }
      };

      try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get(['bf_custom_sheets_links'], (res) => {
            if (handled) return;
            let lastErr = null;
            try {
              lastErr = chrome.runtime ? chrome.runtime.lastError : null;
            } catch (e) { }

            if (!lastErr && res && Array.isArray(res.bf_custom_sheets_links)) {
              handled = true;
              callback(res.bf_custom_sheets_links);
              return;
            }
            fallbackLocal();
          });
          return;
        }
      } catch (e) { }

      fallbackLocal();
    };

    const saveStoredCustomLinks = (links, callback) => {
      try {
        localStorage.setItem('bf_custom_sheets_links', JSON.stringify(links));
      } catch (e) {}

      try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ bf_custom_sheets_links: links }, () => {
            try {
              if (chrome.runtime && chrome.runtime.lastError) { /* ignore */ }
            } catch (e) { }
            if (callback) callback();
          });
          return;
        }
      } catch (e) {}

      if (callback) callback();
    };

    let customLinksList = [];
    try {
      const initialSaved = localStorage.getItem('bf_custom_sheets_links');
      if (initialSaved) customLinksList = JSON.parse(initialSaved) || [];
    } catch (e) {}

    let rootSheetsMenu = null;
    let rebuildSheetsMenu = null;
    const activeSheetsSubmenusByDepth = {};

    getStoredCustomLinks((links) => {
      if (Array.isArray(links)) {
        customLinksList = links;
        if (typeof rebuildSheetsMenu === 'function') {
          rebuildSheetsMenu();
        }
      }
    });

    const openAddCustomLinkModal = () => {
      closeAllSheetsMenus();

      const existing = document.getElementById('bf-custom-link-backdrop');
      if (existing) existing.remove();

      if (!document.getElementById('bf-custom-link-style')) {
        const style = document.createElement('style');
        style.id = 'bf-custom-link-style';
        style.textContent = `
          @keyframes bfFadeInCustomBackdrop {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes bfFadeInCustomModal {
            from { opacity: 0; transform: scale(0.96) translateY(-6px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
        `;
        document.head.appendChild(style);
      }

      // Backdrop overlay
      const backdrop = document.createElement('div');
      backdrop.id = 'bf-custom-link-backdrop';
      backdrop.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(15, 23, 42, 0.65);
        backdrop-filter: blur(4px);
        z-index: 2147483645;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: bfFadeInCustomBackdrop 0.15s ease-out;
      `;

      // Modal container
      const modal = document.createElement('div');
      modal.id = 'bf-custom-link-modal';
      modal.style.cssText = `
        background: #1e293b;
        color: #f8fafc;
        width: 440px;
        max-width: calc(100vw - 40px);
        border-radius: 12px;
        border: 1px solid #334155;
        box-shadow: 0 20px 40px -8px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        animation: bfFadeInCustomModal 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      `;

      // Header
      const header = document.createElement('div');
      header.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 18px;
        background: #0f172a;
        border-bottom: 1px solid #334155;
        user-select: none;
      `;

      const titleWrap = document.createElement('div');
      titleWrap.style.cssText = 'display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px; color: #f8fafc;';
      titleWrap.innerHTML = '<span style="color:#c084fc; font-size: 16px;">🔗</span> Add Custom Link';

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.textContent = '✕';
      closeBtn.title = 'Close (Esc)';
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

      header.appendChild(titleWrap);
      header.appendChild(closeBtn);
      modal.appendChild(header);

      // Body Form
      const body = document.createElement('div');
      body.style.cssText = 'padding: 18px; display: flex; flex-direction: column; gap: 14px;';

      // Input 1: Button Name
      const nameGroup = document.createElement('div');
      nameGroup.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';
      const nameLabel = document.createElement('label');
      nameLabel.style.cssText = 'font-size: 12px; font-weight: 600; color: #cbd5e1;';
      nameLabel.textContent = 'Button Name / Label:';
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.placeholder = 'e.g., Team Tracker, Shift Schedule...';
      nameInput.style.cssText = `
        padding: 8px 12px;
        background: #0f172a;
        border: 1px solid #475569;
        border-radius: 6px;
        color: #fff;
        font-size: 13px;
        outline: none;
        transition: border-color 0.2s, box-shadow 0.2s;
      `;
      nameInput.addEventListener('focus', () => {
        nameInput.style.borderColor = '#a855f7';
        nameInput.style.boxShadow = '0 0 0 2px rgba(168, 85, 247, 0.25)';
      });
      nameInput.addEventListener('blur', () => {
        nameInput.style.borderColor = '#475569';
        nameInput.style.boxShadow = 'none';
      });
      nameGroup.appendChild(nameLabel);
      nameGroup.appendChild(nameInput);
      body.appendChild(nameGroup);

      // Input 2: URL
      const urlGroup = document.createElement('div');
      urlGroup.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';
      const urlLabel = document.createElement('label');
      urlLabel.style.cssText = 'font-size: 12px; font-weight: 600; color: #cbd5e1;';
      urlLabel.textContent = 'URL / Link:';
      const urlInput = document.createElement('input');
      urlInput.type = 'text';
      urlInput.placeholder = 'https://docs.google.com/spreadsheets/d/...';
      urlInput.style.cssText = `
        padding: 8px 12px;
        background: #0f172a;
        border: 1px solid #475569;
        border-radius: 6px;
        color: #fff;
        font-size: 13px;
        outline: none;
        transition: border-color 0.2s, box-shadow 0.2s;
      `;
      urlInput.addEventListener('focus', () => {
        urlInput.style.borderColor = '#a855f7';
        urlInput.style.boxShadow = '0 0 0 2px rgba(168, 85, 247, 0.25)';
      });
      urlInput.addEventListener('blur', () => {
        urlInput.style.borderColor = '#475569';
        urlInput.style.boxShadow = 'none';
      });

      const hintText = document.createElement('div');
      hintText.style.cssText = 'font-size: 11px; color: #94a3b8; margin-top: 2px;';
      hintText.textContent = 'Works with Google Sheets, Forms, Docs, or any web link.';

      urlGroup.appendChild(urlLabel);
      urlGroup.appendChild(urlInput);
      urlGroup.appendChild(hintText);
      body.appendChild(urlGroup);

      // Error message container
      const errorMsg = document.createElement('div');
      errorMsg.style.cssText = 'font-size: 12px; color: #f87171; display: none; margin-top: -4px;';
      body.appendChild(errorMsg);

      // Footer Actions
      const actions = document.createElement('div');
      actions.style.cssText = 'display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px;';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = `
        padding: 7px 14px;
        background: #334155;
        border: none;
        border-radius: 6px;
        color: #cbd5e1;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s, color 0.15s;
      `;
      cancelBtn.addEventListener('mouseenter', () => { cancelBtn.style.background = '#475569'; cancelBtn.style.color = '#fff'; });
      cancelBtn.addEventListener('mouseleave', () => { cancelBtn.style.background = '#334155'; cancelBtn.style.color = '#cbd5e1'; });

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.textContent = 'Save Link';
      saveBtn.style.cssText = `
        padding: 7px 18px;
        background: #7c3aed;
        border: none;
        border-radius: 6px;
        color: #ffffff;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(124, 58, 237, 0.4);
        transition: filter 0.15s, transform 0.1s;
      `;
      saveBtn.addEventListener('mouseenter', () => { saveBtn.style.filter = 'brightness(1.1)'; });
      saveBtn.addEventListener('mouseleave', () => { saveBtn.style.filter = 'brightness(1)'; });
      saveBtn.addEventListener('mousedown', () => { saveBtn.style.transform = 'scale(0.97)'; });
      saveBtn.addEventListener('mouseup', () => { saveBtn.style.transform = 'scale(1)'; });

      actions.appendChild(cancelBtn);
      actions.appendChild(saveBtn);
      body.appendChild(actions);

      modal.appendChild(body);
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);

      setTimeout(() => nameInput.focus(), 50);

      const closeDialog = () => {
        window.removeEventListener('keydown', onKeyDown);
        backdrop.remove();
      };

      const onKeyDown = (e) => {
        if (e.key === 'Escape') {
          closeDialog();
        } else if (e.key === 'Enter') {
          saveHandler();
        }
      };
      window.addEventListener('keydown', onKeyDown);

      closeBtn.addEventListener('click', closeDialog);
      cancelBtn.addEventListener('click', closeDialog);
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeDialog();
      });

      const saveHandler = () => {
        const nameVal = nameInput.value.trim();
        let urlVal = urlInput.value.trim();

        if (!nameVal) {
          errorMsg.textContent = 'Please enter a name for the button.';
          errorMsg.style.display = 'block';
          nameInput.focus();
          return;
        }

        if (!urlVal) {
          errorMsg.textContent = 'Please enter a URL or link.';
          errorMsg.style.display = 'block';
          urlInput.focus();
          return;
        }

        if (!/^https?:\/\//i.test(urlVal)) {
          urlVal = 'https://' + urlVal;
        }

        const newLink = {
          id: 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          name: nameVal,
          url: urlVal
        };

        customLinksList.push(newLink);
        saveStoredCustomLinks(customLinksList, () => {
          showToast(`Custom link "${nameVal}" added to Custom links!`, 'info');
        });

        if (typeof rebuildSheetsMenu === 'function') {
          rebuildSheetsMenu();
        }
        closeDialog();
      };

      saveBtn.addEventListener('click', saveHandler);
    };

    const deleteCustomLink = (id, label) => {
      if (!confirm(`Are you sure you want to remove "${label}" from Custom links?`)) {
        return;
      }
      customLinksList = customLinksList.filter(l => l.id !== id);
      saveStoredCustomLinks(customLinksList, () => {
        showToast(`Custom link "${label}" removed.`, 'info');
      });
      if (typeof rebuildSheetsMenu === 'function') {
        rebuildSheetsMenu();
      }
    };

    const buildFullSheetsData = () => {
      const customChildren = [];
      if (customLinksList && customLinksList.length > 0) {
        customLinksList.forEach(cl => {
          customChildren.push({
            label: cl.name,
            url: cl.url,
            id: cl.id,
            isCustomLink: true
          });
        });
        customChildren.push({ isDivider: true });
      } else {
        customChildren.push({
          label: 'No custom links yet',
          disabled: true
        });
        customChildren.push({ isDivider: true });
      }
      customChildren.push({
        label: '+ Add Custom link',
        action: 'add_custom',
        highlight: true
      });

      return [
        {
          label: 'KB',
          children: [
            {
              label: 'Rating',
              children: [
                { label: 'Rating', key: 'kb_rating' },
                { label: 'Reopened KB', key: 'kb_reopened' }
              ]
            },
            { label: 'Retention', key: 'kb_retention' },
            { label: 'Rider', key: 'kb_rider' },
            { label: 'Chat', key: 'kb_chat' },
            { label: 'Restaurant', key: 'kb_restaurant' }
          ]
        },
        {
          label: 'Shift forms',
          children: [
            { label: 'Swap shift form', key: 'shifts_swap_shift' },
            { label: 'Swap off form', key: 'shifts_swap_off' },
            { label: 'Off queue form', key: 'shifts_off_queue' },
            { label: 'Late login', key: 'shifts_late' },
            { label: 'Vacation form', key: 'shifts_vacation' }
          ]
        },
        {
          label: 'Other sheets',
          children: [
            { label: 'Agent view', key: 'other_agent_view' },
            { label: 'Email templates', key: 'other_email_templates' },
            { label: 'Map', key: 'other_map' },
            { label: 'Abuser form', key: 'other_abuser_form' },
            { label: 'Abuser Form (Responses)', key: 'other_abuser_responses' }
          ]
        },
        {
          label: 'Custom links',
          children: customChildren
        },
        { isDivider: true },
        {
          label: '+ Add Custom link',
          action: 'add_custom',
          highlight: true
        }
      ];
    };

    closeAllSheetsMenus = () => {
      if (typeof closeSystemMenu === 'function') closeSystemMenu();
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
      menu.style.maxWidth = isRoot ? '190px' : '250px';

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
        if (item.isDivider) {
          const div = document.createElement('div');
          div.className = 'bf-sheets-divider';
          div.style.cssText = 'height: 1px; background: rgba(255, 255, 255, 0.12); margin: 4px 2px;';
          listContainer.appendChild(div);
          return;
        }

        const itemEl = document.createElement('div');
        itemEl.className = 'bf-sheets-item';
        itemEl.style.position = 'relative';
        itemEl.style.display = 'flex';
        itemEl.style.alignItems = 'center';
        itemEl.style.justifyContent = 'space-between';
        itemEl.style.padding = '6px 10px';
        itemEl.style.borderRadius = '5px';
        itemEl.style.cursor = item.disabled ? 'default' : 'pointer';
        itemEl.style.transition = 'background-color 0.15s ease, color 0.15s ease';
        itemEl.style.whiteSpace = 'nowrap';
        itemEl.style.gap = '8px';

        if (item.disabled) {
          itemEl.style.color = '#94a3b8';
          itemEl.style.fontStyle = 'italic';
        } else if (item.highlight) {
          itemEl.style.color = '#c084fc';
        }

        const textSpan = document.createElement('span');
        textSpan.textContent = item.label;
        textSpan.style.fontWeight = item.highlight ? '600' : '500';
        textSpan.style.fontSize = '12px';
        textSpan.style.overflow = 'hidden';
        textSpan.style.textOverflow = 'ellipsis';
        itemEl.appendChild(textSpan);

        if (item.disabled) {
          listContainer.appendChild(itemEl);
          return;
        }

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

            // Vertical positioning — ensure menu stays fully within viewport
            const viewH = window.innerHeight;
            const availableDown = viewH - rect.top - 10;
            const availableUp = rect.bottom - 10;
            const dynamicMax = Math.max(150, viewH - 20);
            const effectiveMax = Math.min(220, dynamicMax);
            childMenu.style.maxHeight = `${effectiveMax}px`;
            const menuHeight = Math.min(childMenu.scrollHeight || effectiveMax, effectiveMax);

            let topPos;
            if (availableDown >= menuHeight) {
              topPos = rect.top - 4;
            } else if (availableUp >= menuHeight) {
              topPos = rect.bottom - menuHeight + 4;
            } else {
              topPos = Math.max(10, viewH - menuHeight - 10);
            }
            if (topPos + menuHeight > viewH - 10) {
              topPos = Math.max(10, viewH - menuHeight - 10);
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
          if (item.isCustomLink) {
            const deleteBtn = document.createElement('span');
            deleteBtn.innerHTML = '&times;';
            deleteBtn.title = 'Remove custom link';
            deleteBtn.style.cssText = `
              color: #94a3b8;
              font-size: 15px;
              line-height: 1;
              padding: 0 4px;
              border-radius: 4px;
              cursor: pointer;
              opacity: 0.5;
              transition: color 0.15s, opacity 0.15s, background-color 0.15s;
            `;
            deleteBtn.addEventListener('mouseenter', () => {
              deleteBtn.style.color = '#ef4444';
              deleteBtn.style.opacity = '1';
              deleteBtn.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
            });
            deleteBtn.addEventListener('mouseleave', () => {
              deleteBtn.style.color = '#94a3b8';
              deleteBtn.style.opacity = '0.5';
              deleteBtn.style.backgroundColor = 'transparent';
            });
            deleteBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              deleteCustomLink(item.id, item.label);
            });
            itemEl.appendChild(deleteBtn);
          }

          itemEl.addEventListener('mouseenter', () => {
            itemEl.style.backgroundColor = item.highlight ? 'rgba(124, 58, 237, 0.25)' : '#334155';
          });
          itemEl.addEventListener('mouseleave', () => {
            itemEl.style.backgroundColor = 'transparent';
          });

          itemEl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (item.action === 'add_custom') {
              openAddCustomLinkModal();
              return;
            }

            closeAllSheetsMenus();

            if (item.isCustomLink) {
              if (item.url && typeof item.url === 'string' && item.url.trim().length > 0) {
                showToast(`Opening [Custom links] ${item.label}...`, 'info');
                window.open(item.url.trim(), '_blank', 'noopener,noreferrer');
              }
              return;
            }

            const url = SHEETS_URLS[item.key];
            const category = path.length > 0 ? path.join(' > ') : 'Sheets';
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

    rebuildSheetsMenu = () => {
      const wasOpen = rootSheetsMenu && rootSheetsMenu.style.display === 'block';
      closeAllSheetsMenus();
      const existingMenus = sheetsWrapper.querySelectorAll('.bf-sheets-menu');
      existingMenus.forEach(m => m.remove());
      rootSheetsMenu = buildSheetsSubmenu(buildFullSheetsData(), true, []);
      sheetsWrapper.appendChild(rootSheetsMenu);
      if (typeof updateSheetsMenuPosition === 'function') {
        updateSheetsMenuPosition(currentSide);
      }
      if (wasOpen) {
        rootSheetsMenu.style.display = 'block';
      }
    };

    rebuildSheetsMenu();

    sheetsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof closeSystemMenu === 'function') {
        closeSystemMenu();
      }
      if (typeof closeAllTreeMenus === 'function') {
        closeAllTreeMenus();
      }
      if (typeof closeAllAutoFillMenus === 'function') {
        closeAllAutoFillMenus();
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

    // =========================================================================
    // System Button & Cascading Menu (Internal Systems: Switcher, Payment, SMS, Kairos)
    // =========================================================================
    const systemBtn = createBtn('btn-system-menu', 'System', '#0d9488');
    systemBtn.title = 'Internal Systems & Portals';
    systemBtn.style.width = '100%';
    systemBtn.style.display = 'flex';
    systemBtn.style.justifyContent = 'center';
    systemBtn.style.alignItems = 'center';

    const systemWrapper = document.createElement('div');
    systemWrapper.id = 'bf-system-wrapper';
    systemWrapper.style.position = 'relative';
    systemWrapper.style.width = '100%';
    systemWrapper.appendChild(systemBtn);

    const SYSTEM_ITEMS = [
      { label: 'Freshdesk', url: 'https://freshdesk.breadfast.com/' },
      { label: 'Switcher', url: 'https://www.breadfast.com/switcher/' },
      { label: 'Payment panel', url: 'https://payment-panel.breadfast.com/#/orders' },
      { label: 'Coupons', url: 'https://www.breadfast.com/dashboard/coupons' },
      { label: 'SMS', url: 'https://www.breadfast.com/dashboard/sms/create' },
      { label: 'Kairos', url: 'https://kairos.breadfast.com/app/accounts/1/dashboard' }
    ];

    const systemMenu = document.createElement('div');
    systemMenu.className = 'bf-system-menu';
    systemMenu.style.backgroundColor = '#1e293b';
    systemMenu.style.color = '#f8fafc';
    systemMenu.style.borderRadius = '8px';
    systemMenu.style.padding = '6px';
    systemMenu.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.3)';
    systemMenu.style.border = '1px solid rgba(255, 255, 255, 0.15)';
    systemMenu.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    systemMenu.style.fontSize = '12px';
    systemMenu.style.userSelect = 'none';
    systemMenu.style.display = 'none';
    systemMenu.style.minWidth = '140px';
    systemMenu.style.maxWidth = '180px';
    systemMenu.style.position = 'absolute';
    systemMenu.style.zIndex = '1000000';
    systemMenu.style.bottom = '0';

    if (currentSide === 'right') {
      systemMenu.style.right = 'calc(100% + 8px)';
      systemMenu.style.left = 'auto';
    } else {
      systemMenu.style.left = 'calc(100% + 8px)';
      systemMenu.style.right = 'auto';
    }

    const systemListContainer = document.createElement('div');
    systemListContainer.className = 'bf-system-list-container';
    systemListContainer.style.display = 'flex';
    systemListContainer.style.flexDirection = 'column';
    systemListContainer.style.gap = '2px';
    systemMenu.appendChild(systemListContainer);

    SYSTEM_ITEMS.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'bf-system-item';
      itemEl.style.position = 'relative';
      itemEl.style.display = 'flex';
      itemEl.style.alignItems = 'center';
      itemEl.style.padding = '6px 10px';
      itemEl.style.borderRadius = '5px';
      itemEl.style.cursor = 'pointer';
      itemEl.style.transition = 'background-color 0.15s ease, color 0.15s ease';
      itemEl.style.whiteSpace = 'nowrap';

      const textSpan = document.createElement('span');
      textSpan.textContent = item.label;
      textSpan.style.fontWeight = '500';
      textSpan.style.fontSize = '12px';
      itemEl.appendChild(textSpan);

      itemEl.addEventListener('mouseenter', () => {
        itemEl.style.backgroundColor = '#334155';
      });
      itemEl.addEventListener('mouseleave', () => {
        itemEl.style.backgroundColor = 'transparent';
      });
      itemEl.addEventListener('click', (e) => {
        e.stopPropagation();
        closeSystemMenu();
        showToast(`Opening [System] ${item.label}...`, 'info');
        window.open(item.url, '_blank', 'noopener,noreferrer');
      });

      systemListContainer.appendChild(itemEl);
    });

    systemWrapper.appendChild(systemMenu);

    closeSystemMenu = () => {
      if (systemMenu) systemMenu.style.display = 'none';
      if (systemListContainer) {
        systemListContainer.querySelectorAll('.bf-system-item').forEach(el => {
          el.style.backgroundColor = 'transparent';
        });
      }
    };

    systemBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof closeAllTreeMenus === 'function') closeAllTreeMenus();
      if (typeof closeAllAutoFillMenus === 'function') closeAllAutoFillMenus();
      if (typeof closeAllSheetsMenus === 'function') closeAllSheetsMenus();
      const isOpen = systemMenu.style.display === 'block';
      if (isOpen) {
        closeSystemMenu();
      } else {
        closeSystemMenu();
        systemMenu.style.display = 'block';
      }
    });

    document.addEventListener('click', (e) => {
      if (!systemWrapper.contains(e.target)) {
        closeSystemMenu();
      }
    });

    updateSystemMenuPosition = (side) => {
      if (!systemMenu) return;
      if (side === 'right') {
        systemMenu.style.right = 'calc(100% + 8px)';
        systemMenu.style.left = 'auto';
      } else {
        systemMenu.style.left = 'calc(100% + 8px)';
        systemMenu.style.right = 'auto';
      }
      closeSystemMenu();
    };

    updateSystemMenuPosition(currentSide);

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
    container.appendChild(autoFillWrapper);

    container.appendChild(createSectionDivider());

    // Section 2: Customer & Operations (Calm Teal: RMS -> SMS -> Chat -> System)
    container.appendChild(rmsBtn);
    container.appendChild(smsBtn);
    container.appendChild(chatBtn);
    container.appendChild(systemWrapper);

    container.appendChild(createSectionDivider());

    // Section 3: Tools & Utilities (Calm Violet)
    container.appendChild(delayBtn);
    container.appendChild(calcBtn);
    container.appendChild(emailBtn);
    container.appendChild(sheetsWrapper);

    document.body.appendChild(container);
    document.body.appendChild(dockTab);
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
    const rawOrderNumber = usp.get('bf_order_number');
    const bfOrderNumber = (rawOrderNumber && isValidOrderNumber(rawOrderNumber)) ? normalizeOrderNumber(rawOrderNumber) : null;
    const bfDeliveryBy = usp.get('bf_delivery_by');
    const bfIsSenior = usp.get('bf_is_senior') === '1';
    const bfTreeChoice = usp.get('bf_tree_choice');
    const bfCategory = usp.get('bf_category');
    const bfTreeType = usp.get('bf_tree_type') || (bfCategory && bfCategory.toLowerCase().includes('feedback') ? 'Feedback' : (bfCategory && bfCategory.toLowerCase().includes('internal') ? 'Internal Requests' : (bfTreeChoice || bfCategory ? 'Complaints' : null)));
    const bfDetail = usp.get('bf_detail') || (bfTreeType && bfTreeType.toLowerCase().includes('internal') ? '' : bfTreeChoice);
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
      if (!bfOrderNumber || !isValidOrderNumber(bfOrderNumber)) return true;
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
        if (targetOrderInput.value && targetOrderInput.value.trim() === bfOrderNumber) return true;

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

      if (!bfOrderNumber || !isValidOrderNumber(bfOrderNumber)) return true;
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
            await new Promise(r => setTimeout(r, 20));
            for (let rTry = 0; rTry < 3; rTry++) {
              if (rTry > 0) await new Promise(r => setTimeout(r, 60));
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
              await new Promise(r => setTimeout(r, 30));
              const typeToApply = bfTreeType || 'Complaints';
              let catToApply = bfCategory || '';
              if (catToApply.includes('>')) {
                catToApply = (catToApply.split('>').pop() || '').trim();
              }
              const detailToApply = bfDetail || (bfTreeChoice !== catToApply ? bfTreeChoice : '') || '';
              const subDetailToApply = bfSubDetail || '';

              const ok = await applyTreeToForm(typeToApply, catToApply, detailToApply, subDetailToApply);
              if (ok) {
                treeAutomationDone = true;
                await new Promise(r => setTimeout(r, 30));
              } else {
                treeOk = false;
              }
            }
          }

          if (orderOk && buOk && delOk && subjOk && descOk && treeOk) {
            allDone = true;
          }
        } catch (e) {
          console.log('[BF Extension] Error in automation sync:', e);
        } finally {
          isSyncing = false;
        }
      };

      const checkAndSync = async () => {
        const formIsRendered = findSubjectInput();
        if (!formIsRendered) return;

        if (allDone || runAttempts > 40) {
          if (masterIv) clearInterval(masterIv);
          return;
        }
        runAttempts++;

        await syncState();
      };

      const masterIv = setInterval(checkAndSync, 40);
      checkAndSync();
    };

    runAutomations();
  }

  // =========================================================================
  // Freshdesk Logic
  // =========================================================================
  // Mount toolbar on Freshdesk and Kairos (AUTO-SHUTDOWN once mounted to ensure 0% CPU lag)
  if (window.location.host.includes('freshdesk') || isKairos) {
    let mountIv = null;
    let observer = null;

    const tryMount = () => {
      if (document.body) {
        ensureButtons();
        if (document.getElementById('bf-custom-ticket-buttons')) {
          if (mountIv) {
            clearInterval(mountIv);
            mountIv = null;
          }
          if (observer) {
            observer.disconnect();
            observer = null;
          }
        }
      }
    };

    mountIv = setInterval(tryMount, 200);

    try {
      if (document.documentElement) {
        observer = new MutationObserver(() => {
          if (document.body && !document.getElementById('bf-custom-ticket-buttons')) {
            tryMount();
          }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
      }
    } catch (e) { }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryMount);
    } else {
      tryMount();
    }
  }

  if (false && window.location.host.includes('freshdesk')) {
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
        // Must be purely digits (4-10 digits), NOT the hyphenated order number (e.g. 2345-678901234)
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
