// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

export const PLUGIN_SETTINGS_SCRIPT = String.raw`
  (function() {
    const manager = window.torrGatePlugins;
    let host;
    let editingId = null;
    let selection = null;
    const element = id => document.getElementById(id);
    const form = element('plugin-instance-form');
    const pluginSelect = element('plugin-instance-plugin');
    const authSelect = element('plugin-instance-auth');

    function showPersistence(isPersisted, message) {
      host.showToast(isPersisted ? message : message + ' Browser storage is unavailable; settings last until reload');
    }

    function renderOptions(options) {
      const plugin = manager.getPlugins().find(entry => entry.id === pluginSelect.value);
      const container = element('plugin-instance-options');
      container.replaceChildren();
      for (const field of plugin.fields) {
        const label = document.createElement('label');
        label.className = 'plugin-field';
        label.textContent = field.label;
        const select = document.createElement(field.type === 'text' ? 'input' : 'select');
        select.className = 'copy-input';
        select.dataset.optionId = field.id;
        if (field.type === 'text') {
          select.type = 'text';
          select.maxLength = 1024;
          select.placeholder = field.placeholder || '';
        }
        for (const choice of field.choices || []) {
          const option = document.createElement('option');
          option.value = choice.value;
          option.textContent = choice.label;
          select.appendChild(option);
        }
        select.value = options?.[field.id] ?? field.defaultValue;
        label.appendChild(select);
        container.appendChild(label);
      }
    }

    function renderAuthChoices(value) {
      const plugin = manager.getPlugins().find(entry => entry.id === pluginSelect.value);
      const choices = plugin.authTypes || [{ label: 'No authentication', value: 'none' }, { label: 'Basic', value: 'basic' }, { label: 'Bearer sign-in · automatic renewal', value: 'bearer' }];
      authSelect.replaceChildren();
      for (const choice of choices) {
        const option = document.createElement('option');
        option.value = choice.value;
        option.textContent = choice.label;
        authSelect.appendChild(option);
      }
      authSelect.value = choices.some(choice => choice.value === value) ? value : choices[0].value;
      element('plugin-auth-method-field').hidden = choices.length === 1;
      element('plugin-torrplay-help').hidden = plugin.id !== 'torrplay';
      element('plugin-qbittorrent-help').hidden = plugin.id !== 'qbittorrent';
      element('plugin-instance-url').placeholder = plugin.id === 'qbittorrent' ? 'https://qbit.example.com' : 'https://play.example.com';
    }

    function renderAuth() {
      const needsUsername = authSelect.value === 'basic' || authSelect.value === 'bearer';
      const isApiKey = authSelect.value === 'api-key';
      const plugin = manager.getPlugins().find(entry => entry.id === pluginSelect.value);
      const saved = manager.getInstances().find(instance => instance.id === editingId);
      const hasSavedSecret = saved && saved.pluginId === pluginSelect.value && saved.authType === authSelect.value && manager.hasCredentials(saved.id);
      element('plugin-username-field').hidden = !needsUsername;
      element('plugin-secret-field').hidden = authSelect.value === 'none';
      element('plugin-instance-username').required = needsUsername;
      element('plugin-secret-label').textContent = isApiKey ? 'API key' : 'Password';
      if (isApiKey && plugin.secretPattern) element('plugin-instance-secret').pattern = plugin.secretPattern;
      else element('plugin-instance-secret').removeAttribute('pattern');
      element('plugin-instance-secret').required = isApiKey && !hasSavedSecret;
      element('plugin-instance-secret').placeholder = hasSavedSecret ? 'Leave blank to keep current ' + (isApiKey ? 'API key' : 'password') : 'Enter ' + (isApiKey ? 'API key' : 'password');
      element('btn-plugin-token').hidden = authSelect.value !== 'bearer';
    }

    function resetForm() {
      form.reset();
      editingId = null;
      element('plugin-form-title').textContent = 'Add instance';
      element('btn-plugin-reset').textContent = 'Clear form';
      element('plugin-connection-status').textContent = '';
      renderOptions();
      renderAuthChoices();
      renderAuth();
    }

    function editInstance(instance) {
      editingId = instance.id;
      element('plugin-form-title').textContent = 'Edit instance';
      element('btn-plugin-reset').textContent = 'Cancel edit';
      pluginSelect.value = instance.pluginId;
      element('plugin-instance-name').value = instance.name;
      element('plugin-instance-url').value = instance.baseUrl;
      element('plugin-instance-enabled').checked = instance.enabled;
      renderAuthChoices(instance.authType);
      element('plugin-instance-username').value = instance.username;
      element('plugin-instance-secret').value = '';
      renderOptions(instance.options);
      renderAuth();
      element('plugin-instance-name').focus();
    }

    function readForm() {
      const options = {};
      element('plugin-instance-options').querySelectorAll('[data-option-id]').forEach(select => {
        options[select.dataset.optionId] = select.value;
      });
      return {
        authType: authSelect.value,
        baseUrl: element('plugin-instance-url').value,
        enabled: element('plugin-instance-enabled').checked,
        id: editingId || manager.createInstanceId(),
        name: element('plugin-instance-name').value,
        options,
        pluginId: pluginSelect.value,
        username: element('plugin-instance-username').value,
      };
    }

    function refreshActions() {
      host.refreshActions();
    }

    function renderSettings() {
      const toggles = element('plugin-toggles');
      toggles.replaceChildren();
      for (const plugin of manager.getPlugins()) {
        const label = document.createElement('label');
        label.className = 'plugin-toggle';
        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.checked = manager.isEnabled(plugin.id);
        toggle.addEventListener('change', async () => {
          showPersistence(await manager.setEnabled(plugin.id, toggle.checked), plugin.name + (toggle.checked ? ' enabled' : ' disabled'));
          refreshActions();
        });
        label.appendChild(toggle);
        label.appendChild(document.createTextNode('Enable ' + plugin.name));
        toggles.appendChild(label);
      }
      const list = element('plugin-instance-list');
      list.replaceChildren();
      const instances = manager.getInstances();
      if (!instances.length) list.textContent = 'No saved instances yet. Add an instance to get started.';
      for (const instance of instances) {
        const row = document.createElement('div');
        row.className = 'plugin-instance-row';
        const text = document.createElement('span');
        text.className = 'plugin-instance-info';
        const name = document.createElement('strong');
        name.textContent = instance.name;
        const url = document.createElement('small');
        const plugin = manager.getPlugins().find(entry => entry.id === instance.pluginId);
        url.textContent = plugin.name + ' · ' + instance.baseUrl + (instance.enabled ? '' : ' · disabled');
        text.appendChild(name);
        text.appendChild(url);
        row.appendChild(text);
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'nav-btn';
        edit.textContent = 'Edit';
        edit.addEventListener('click', () => editInstance(instance));
        row.appendChild(edit);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'nav-btn plugin-remove';
        remove.textContent = 'Remove';
        remove.addEventListener('click', async () => {
          showPersistence(await manager.removeInstance(instance.id), 'Instance removed');
          if (editingId === instance.id) resetForm();
          renderSettings();
          refreshActions();
        });
        row.appendChild(remove);
        list.appendChild(row);
      }
    }

    function openPluginModal(modal) {
      host.closeModal(element('modal-details'));
      host.openModal(modal);
    }

    function openSettings(instance) {
      renderSettings();
      resetForm();
      openPluginModal(element('modal-plugins'));
      if (instance) editInstance(instance);
      else element('plugin-instance-name').focus();
    }

    async function send(instance, item, button) {
      if (instance.authType !== 'none' && !manager.hasCredentials(instance.id)) {
        openSettings(instance);
        host.showToast('Enter credentials for ' + instance.name + ', save, then send again');
        return;
      }
      button.disabled = true;
      const label = button.textContent;
      button.textContent = 'Sending…';
      host.showToast('Sending to ' + instance.name + '…');
      try {
        const result = await manager.send(instance.id, item, host.resolveMagnet);
        if (result.status !== 'pending') {
          host.showToast(result.status === 'exists' ? 'Torrent already exists in ' + instance.name : 'Sent to ' + instance.name);
          host.closeModal(element('modal-plugin-targets'));
        }
      } catch (error) {
        host.showToast(error.message || 'Could not send torrent');
      } finally {
        button.disabled = false;
        button.textContent = label;
      }
    }

    window.torrGatePluginUi = {
      handleAction: function(button, item) {
        const pluginId = button.dataset.pluginId;
        const targets = manager.getTargets(pluginId);
        if (!targets.length) {
          openSettings();
          host.showToast('Add and enable an instance to send this release');
        } else if (targets.length === 1) {
          send(targets[0], item, button);
        } else {
          selection = { item, pluginId };
          element('plugin-target-title').textContent = button.textContent;
          const select = element('plugin-target-select');
          select.replaceChildren();
          for (const instance of targets) {
            const option = document.createElement('option');
            option.value = instance.id;
            option.textContent = instance.name;
            select.appendChild(option);
          }
          openPluginModal(element('modal-plugin-targets'));
          select.focus();
        }
      },
      initialize: function(context) {
        host = context;
        element('plugin-gateway-origin').textContent = window.location.origin;
        for (const plugin of manager.getPlugins()) {
          const option = document.createElement('option');
          option.value = plugin.id;
          option.textContent = plugin.name;
          pluginSelect.appendChild(option);
        }
        resetForm();
        manager.subscribe(() => {
          if (editingId && !manager.getInstances().some(instance => instance.id === editingId)) resetForm();
          renderSettings();
          refreshActions();
        });
        element('btn-open-plugins').addEventListener('click', () => openSettings());
        pluginSelect.addEventListener('change', () => {
          element('plugin-instance-username').value = '';
          element('plugin-instance-secret').value = '';
          element('plugin-connection-status').textContent = '';
          renderOptions();
          renderAuthChoices();
          renderAuth();
        });
        authSelect.addEventListener('change', () => {
          element('plugin-instance-secret').value = '';
          renderAuth();
        });
        element('btn-plugin-reset').addEventListener('click', resetForm);
        element('btn-plugin-add').addEventListener('click', () => {
          resetForm();
          element('plugin-instance-name').focus();
        });
        element('btn-plugin-token').addEventListener('click', async function() {
          if (!form.reportValidity()) return;
          this.disabled = true;
          const status = element('plugin-connection-status');
          status.dataset.state = 'loading';
          status.textContent = 'Getting token…';
          try {
            const instance = readForm();
            const isPersisted = await manager.upsertInstance(instance, element('plugin-instance-secret').value);
            editingId = instance.id;
            await manager.authorize(instance.id);
            resetForm();
            renderSettings();
            refreshActions();
            status.dataset.state = 'success';
            status.textContent = 'Token acquired. It will renew automatically before an API request when less than a minute remains.';
            showPersistence(isPersisted, 'Token acquired');
          } catch (error) {
            status.dataset.state = 'error';
            status.textContent = error.message;
            host.showToast(error.message);
          } finally {
            this.disabled = false;
          }
        });
        form.addEventListener('submit', async event => {
          event.preventDefault();
          try {
            const isPersisted = await manager.upsertInstance(readForm(), element('plugin-instance-secret').value);
            resetForm();
            renderSettings();
            refreshActions();
            showPersistence(isPersisted, 'Instance saved');
          } catch (error) {
            host.showToast(error.message);
          }
        });
        element('btn-plugin-test').addEventListener('click', async function() {
          if (!form.reportValidity()) return;
          this.disabled = true;
          const label = this.textContent;
          this.textContent = 'Testing…';
          const status = element('plugin-connection-status');
          status.dataset.state = 'loading';
          status.textContent = 'Testing connection…';
          try {
            const result = await manager.test(readForm(), element('plugin-instance-secret').value);
            if (result.status !== 'success') throw new Error('Connection test returned an unexpected response');
            status.dataset.state = 'success';
            status.textContent = 'Connection successful';
            host.showToast('Connection successful');
          } catch (error) {
            status.dataset.state = 'error';
            status.textContent = error.message;
            host.showToast(error.message);
          } finally {
            this.disabled = false;
            this.textContent = label;
          }
        });
        element('btn-plugin-send').addEventListener('click', function() {
          if (!selection) return;
          const instance = manager.getTargets(selection.pluginId).find(entry => entry.id === element('plugin-target-select').value);
          if (!instance) return host.showToast('Selected instance is unavailable');
          send(instance, selection.item, this);
        });
      },
      renderActions: function(item, index) {
        return manager.getPlugins().filter(plugin => manager.isEnabled(plugin.id) && plugin.canHandle(item)).map(plugin =>
          '<button type="button" class="action-btn btn-plugin-action" data-plugin-id="' + host.escapeHtml(plugin.id) + '" data-index="' + index + '">' + host.escapeHtml(plugin.actionLabel) + '</button>'
        ).join('');
      },
    };
  })();`;
