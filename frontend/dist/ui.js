// Общие функции интерфейса. Все запросы идут через /api/ к существующему FastAPI.
const paths = {
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  server: '<rect x="4" y="3" width="16" height="7" rx="2"/><rect x="4" y="14" width="16" height="7" rx="2"/><path d="M8 6.5h.01M8 17.5h.01M12 6.5h5M12 17.5h5"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  'alert-triangle': '<path d="m10.3 4-8 14a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  'alert-circle': '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 18 17"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chart: '<path d="M4 4v16h17M7 14l4-5 4 3 5-6"/>',
  'arrow-left': '<path d="m11 5-7 7 7 7M4 12h16"/>',
  'arrow-right': '<path d="m13 5 7 7-7 7M20 12H4"/>',
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6Z M14 5l5 5"/>',
  thermometer: '<path d="M9 14.5V5a3 3 0 0 1 6 0v9.5a5 5 0 1 1-6 0Z"/><path d="M12 8v10"/>',
  gauge: '<path d="M5 19a9 9 0 1 1 14 0Z"/><path d="m12 14 4-5M12 5v1M5 12h1M18 12h1"/><circle cx="12" cy="14" r="1"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
};

export function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.activity}</svg>`;
}

export function mountIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(element => {
    element.innerHTML = icon(element.dataset.icon);
  });
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

export async function api(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`/api${path}`, {
      method: options.method || 'GET',
      headers: { Accept: 'application/json', ...(options.json !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: options.json !== undefined ? JSON.stringify(options.json) : undefined,
      cache: 'no-store',
      signal: controller.signal,
    });
    if (response.status === 204) return null;
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : null;
    if (!response.ok) {
      let message = 'Не удалось выполнить запрос. Попробуйте ещё раз.';
      if (typeof data?.detail === 'string') message = data.detail;
      if (Array.isArray(data?.detail)) {
        const fieldNames = { name: 'Название', equipment_type: 'Тип', serial_number: 'Серийный номер', temperature: 'Температура', pressure: 'Давление', warning_limit: 'Порог предупреждения', critical_limit: 'Критический порог' };
        message = data.detail.map(error => `${fieldNames[error.loc?.at(-1)] || 'Данные'}: ${error.msg}`).join('; ');
      }
      if (response.status >= 500) message = 'Сервер временно недоступен. Попробуйте обновить данные.';
      throw new ApiError(message, response.status);
    }
    if (data === null) throw new ApiError('Сервер вернул неожиданный ответ. Попробуйте обновить страницу.');
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === 'AbortError') throw new ApiError('Сервер долго не отвечает. Попробуйте ещё раз.');
    throw new ApiError('Не удалось связаться с сервером. Проверьте подключение и обновите данные.');
  } finally {
    clearTimeout(timeout);
  }
}

export async function latestMeasurement(id) {
  try {
    return await api(`/equipment/${id}/measurements/latest`);
  } catch (error) {
    if (error.status === 404 && error.message === 'Измерения оборудования не найдены') return null;
    throw error;
  }
}

export function number(value, precision = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: precision }).format(Number(value));
}

export function dateTime(value, options = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', ...options }).format(date);
}

export function localDateTime(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}

export function timezoneLabel() {
  return `Время по часовому поясу браузера: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
}

const statusNames = { NORMAL: 'В норме', WARNING: 'Предупреждение', CRITICAL: 'Критическое', UNKNOWN: 'Нет показаний' };

export function statusBadge(status) {
  const key = Object.hasOwn(statusNames, status) ? status : 'UNKNOWN';
  return `<span class="status-badge status-${key.toLowerCase()}" title="${statusNames[key]}"><span class="status-dot"></span>${key}</span>`;
}

export function setConnection(online) {
  const element = document.getElementById('connection-status');
  if (!element) return;
  element.className = `system-status ${online ? 'is-online' : 'is-offline'}`;
  element.innerHTML = `<span class="status-dot"></span><span>${online ? 'Система работает' : 'Нет связи с API'}</span>`;
}

export function markUpdated() {
  const element = document.getElementById('last-updated');
  if (element) element.textContent = `Обновлено в ${new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date())}`;
}

export function showError(element, message = '') {
  element.textContent = message;
  element.hidden = !message;
}

export function toast(message, isError = false) {
  const region = document.getElementById('toast-region');
  const element = document.createElement('div');
  element.className = `toast${isError ? ' toast-error' : ''}`;
  element.textContent = message;
  region?.append(element);
  setTimeout(() => element.remove(), 5000);
}

export function emptyChart(container, title, description = '') {
  container.innerHTML = `<div class="empty-state"><span class="empty-icon">${icon('chart')}</span><p class="empty-title">${escapeHtml(title)}</p><p class="empty-description">${escapeHtml(description)}</p></div>`;
}

export function setButtonBusy(button, busy, busyText = 'Сохраняем…') {
  if (busy) {
    button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.textContent = busyText;
  } else {
    button.disabled = false;
    if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
  }
}

// Общие формы используются на главной странице и в карточке устройства.
function installDialogs() {
  document.body.insertAdjacentHTML('beforeend', `
    <dialog class="modal" id="equipment-dialog" aria-labelledby="equipment-dialog-title">
      <div class="modal-header"><div><h2 class="modal-title" id="equipment-dialog-title">Добавить оборудование</h2><p class="modal-description">Укажите данные устройства и температурные пороги</p></div><button class="button button-icon modal-close" type="button" data-close-dialog aria-label="Закрыть">${icon('close')}</button></div>
      <form id="equipment-form" class="modal-body">
        <div class="form-grid">
          <label class="field" style="grid-column:1/-1"><span class="field-label">Название оборудования</span><input name="name" id="equipment-name" placeholder="Например, Насос №1" required minlength="3" maxlength="100" autocomplete="off"></label>
          <label class="field"><span class="field-label">Тип оборудования</span><input name="equipment_type" placeholder="Например, Насос" required minlength="3" maxlength="100" autocomplete="off"></label>
          <label class="field"><span class="field-label">Серийный номер</span><input name="serial_number" placeholder="Уникальный серийный номер" required minlength="1" maxlength="100" autocomplete="off"></label>
          <label class="field"><span class="field-label">Порог предупреждения, °C</span><input name="warning_limit" type="number" step="any" min="-273.15" value="70" required></label>
          <label class="field"><span class="field-label">Критический порог, °C</span><input name="critical_limit" type="number" step="any" min="-273.15" value="90" required></label>
        </div>
        <p class="field-hint">Порог предупреждения должен быть ниже критического. Состояние определяется по последней температуре.</p>
        <p id="equipment-form-error" class="form-error" role="alert" hidden></p>
        <div class="form-actions"><button class="button button-secondary" type="button" data-close-dialog>Отмена</button><button class="button button-primary" type="submit" id="save-equipment">Добавить оборудование</button></div>
      </form>
    </dialog>
    <dialog class="modal" id="measurement-dialog" aria-labelledby="measurement-dialog-title">
      <div class="modal-header"><div><h2 class="modal-title" id="measurement-dialog-title">Добавить показание</h2><p class="modal-description">Отправьте новое измерение для выбранного устройства</p></div><button class="button button-icon modal-close" type="button" data-close-dialog aria-label="Закрыть">${icon('close')}</button></div>
      <form id="measurement-form" class="modal-body">
        <label class="field"><span class="field-label">Оборудование</span><select name="equipment_id" id="measurement-equipment" required></select></label>
        <div class="form-grid" style="margin-top:18px">
          <label class="field"><span class="field-label">Температура, °C</span><input id="measurement-temperature" name="temperature" type="number" step="any" min="-273.15" placeholder="52.4" required></label>
          <label class="field"><span class="field-label">Давление, бар <span class="optional">необязательно</span></span><input name="pressure" type="number" step="any" placeholder="2.4"></label>
        </div>
        <p class="field-hint">Время получения сохранится автоматически. Если давление не измеряется, оставьте поле пустым.</p>
        <p id="measurement-form-error" class="form-error" role="alert" hidden></p>
        <div class="form-actions"><button class="button button-secondary" type="button" data-close-dialog>Отмена</button><button class="button button-primary" type="submit">Отправить показание</button></div>
      </form>
    </dialog>`);

  document.querySelectorAll('dialog.modal').forEach(dialog => {
    dialog.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => { if (!dialog.dataset.busy) dialog.close(); }));
    dialog.addEventListener('cancel', event => { if (dialog.dataset.busy) event.preventDefault(); });
    dialog.addEventListener('click', event => {
      const bounds = dialog.getBoundingClientRect();
      if (event.target === dialog && !dialog.dataset.busy && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
    });
  });

  document.getElementById('equipment-form').addEventListener('submit', saveEquipment);
  document.getElementById('measurement-form').addEventListener('submit', saveMeasurement);
}

export function openEquipmentDialog(equipment = null) {
  const dialog = document.getElementById('equipment-dialog');
  const form = document.getElementById('equipment-form');
  form.reset();
  showError(document.getElementById('equipment-form-error'));
  dialog.dataset.equipmentId = equipment?.id || '';
  document.getElementById('equipment-dialog-title').textContent = equipment ? 'Изменить оборудование' : 'Добавить оборудование';
  document.getElementById('save-equipment').textContent = equipment ? 'Сохранить изменения' : 'Добавить оборудование';
  if (equipment) ['name', 'equipment_type', 'serial_number', 'warning_limit', 'critical_limit'].forEach(key => { form.elements[key].value = equipment[key]; });
  dialog.showModal();
  document.getElementById('equipment-name').focus();
}

export function openMeasurementDialog(equipment, selectedId = equipment[0]?.id) {
  if (!equipment.length) return toast('Сначала добавьте оборудование.');
  const dialog = document.getElementById('measurement-dialog');
  const form = document.getElementById('measurement-form');
  form.reset();
  showError(document.getElementById('measurement-form-error'));
  const select = document.getElementById('measurement-equipment');
  select.replaceChildren(...equipment.map(item => new Option(`${item.name} · ${item.serial_number}`, String(item.id))));
  select.value = String(selectedId);
  dialog.showModal();
  document.getElementById('measurement-temperature').focus();
}

async function saveEquipment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const dialog = document.getElementById('equipment-dialog');
  if (dialog.dataset.busy) return;
  const errorElement = document.getElementById('equipment-form-error');
  const data = {
    name: form.elements.name.value.trim(),
    equipment_type: form.elements.equipment_type.value.trim(),
    serial_number: form.elements.serial_number.value.trim(),
    warning_limit: form.elements.warning_limit.valueAsNumber,
    critical_limit: form.elements.critical_limit.valueAsNumber,
  };
  if (data.name.length < 3 || data.equipment_type.length < 3 || !data.serial_number) return showError(errorElement, 'Название и тип должны содержать минимум 3 символа, серийный номер не должен быть пустым.');
  if (!Number.isFinite(data.warning_limit) || !Number.isFinite(data.critical_limit)) return showError(errorElement, 'Укажите корректные числовые значения порогов.');
  if (data.warning_limit >= data.critical_limit) return showError(errorElement, 'Порог предупреждения должен быть ниже критического порога.');
  const button = form.querySelector('[type="submit"]');
  const id = dialog.dataset.equipmentId;
  showError(errorElement);
  dialog.dataset.busy = 'true';
  setButtonBusy(button, true);
  try {
    const equipment = await api(id ? `/equipment/${id}` : '/equipment/', { method: id ? 'PUT' : 'POST', json: data });
    dialog.close();
    toast(id ? 'Изменения сохранены' : 'Оборудование добавлено');
    document.dispatchEvent(new CustomEvent('equipment:saved', { detail: equipment }));
  } catch (error) {
    showError(errorElement, error.message);
  } finally {
    delete dialog.dataset.busy;
    setButtonBusy(button, false);
  }
}

async function saveMeasurement(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const dialog = document.getElementById('measurement-dialog');
  if (dialog.dataset.busy) return;
  const errorElement = document.getElementById('measurement-form-error');
  const temperature = form.elements.temperature.valueAsNumber;
  const pressure = form.elements.pressure.value === '' ? null : form.elements.pressure.valueAsNumber;
  const id = Number(form.elements.equipment_id.value);
  if (!Number.isInteger(id) || id <= 0) return showError(errorElement, 'Выберите оборудование.');
  if (!Number.isFinite(temperature) || (pressure !== null && !Number.isFinite(pressure))) return showError(errorElement, 'Укажите корректные числовые значения измерений.');
  const button = form.querySelector('[type="submit"]');
  showError(errorElement);
  dialog.dataset.busy = 'true';
  setButtonBusy(button, true, 'Отправляем…');
  try {
    const measurement = await api(`/equipment/${id}/measurements/`, { method: 'POST', json: { temperature, pressure } });
    dialog.close();
    toast('Новое показание сохранено');
    document.dispatchEvent(new CustomEvent('measurement:saved', { detail: measurement }));
  } catch (error) {
    showError(errorElement, error.message);
  } finally {
    delete dialog.dataset.busy;
    setButtonBusy(button, false);
  }
}

mountIcons();
installDialogs();
