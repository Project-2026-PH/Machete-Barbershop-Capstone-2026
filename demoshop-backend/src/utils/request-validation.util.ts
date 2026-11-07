import { AppError } from './error/AppError';

export const REQUEST_JSON_LIMITS = {
  global: '1mb',
  customerQueue: '4mb',
  urlEncoded: '32kb',
  orderSync: '256kb',
  localQueue: '256kb',
  markSynced: '32kb',
} as const;

export const MAX_ORDER_SYNC_ITEMS = 100;
export const MAX_ORDER_SYNC_ITEM_BYTES = 16 * 1024;
export const MAX_LOCAL_QUEUE_PAYLOAD_BYTES = 64 * 1024;
export const MAX_CUSTOMER_NAME_LENGTH = 120;
export const MAX_NESTED_STRING_LENGTH = 16 * 1024;
export const MAX_NESTED_ARRAY_ITEMS = 100;
export const MAX_SYNCED_IDS = 1000;

const reject = (message: string, status = 400): never => {
  throw new AppError(message, status);
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const validateJsonShape = (value: unknown, path = 'body', depth = 0): void => {
  if (depth > 6) reject(`${path} is too deeply nested.`, 413);
  if (typeof value === 'string' && value.length > MAX_NESTED_STRING_LENGTH) {
    reject(`${path} contains a field that is too long.`, 413);
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_NESTED_ARRAY_ITEMS) reject(`${path} contains too many items.`, 413);
    value.forEach((item, index) => validateJsonShape(item, `${path}[${index}]`, depth + 1));
    return;
  }
  if (isPlainObject(value)) {
    if (Object.keys(value).length > 100) reject(`${path} contains too many fields.`, 413);
    Object.entries(value).forEach(([key, item]) => validateJsonShape(item, `${path}.${key}`, depth + 1));
  }
};

const parseEmbeddedPayload = (payload: unknown): Record<string, unknown> => {
  if (typeof payload === 'string') {
    if (Buffer.byteLength(payload, 'utf8') > MAX_NESTED_STRING_LENGTH) {
      reject('Embedded order payload is too large.', 413);
    }
    try {
      payload = JSON.parse(payload);
    } catch {
      reject('Embedded order payload must contain valid JSON.');
    }
  }
  if (!isPlainObject(payload)) reject('Embedded order payload must be an object.');
  return payload as Record<string, unknown>;
};

const validateWalkInCommand = (command: Record<string, unknown>): void => {
  validateJsonShape(command);
  const customerName = command.customerName;
  if (typeof customerName !== 'string') reject('A customer name is required.');
  const customerNameValue = customerName as string;
  if (!customerNameValue.trim()) {
    reject('A customer name is required.');
  }
  if (customerNameValue.trim().length < 2) {
    reject('A customer name must contain at least 2 characters.');
  }
  if (customerNameValue.length > MAX_CUSTOMER_NAME_LENGTH) {
    reject('Customer name is too long.', 413);
  }
  if (!Number.isInteger(command.barberId) || (command.barberId as number) < 1) {
    reject('A valid barber ID is required.');
  }
  if (typeof command.isPrePaid !== 'boolean') reject('isPrePaid must be a boolean.');
  if (command._offlineDestination !== undefined && command._offlineDestination !== '/api/cashier/walk-in') {
    reject('Unsupported offline order destination.');
  }
  if (command.serviceIds !== undefined) {
    if (!Array.isArray(command.serviceIds) || command.serviceIds.length > 20) {
      reject('A maximum of 20 services may be included in a walk-in order.');
    }
    const serviceIds = command.serviceIds as unknown[];
    if (serviceIds.some((id) => !Number.isSafeInteger(id) || (id as number) < 1)) {
      reject('serviceIds must contain positive integer IDs.');
    }
    if (new Set(serviceIds).size !== serviceIds.length) {
      reject('serviceIds cannot contain duplicates.');
    }
  }
    if (command.idempotencyKey !== undefined && (typeof command.idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{8,120}$/.test(command.idempotencyKey))) {
    reject('A valid walk-in idempotency key is required.');
  }
  if (command.reservationCode !== undefined && (typeof command.reservationCode !== 'string' || !/^MCH-\d{1,10}$/i.test(command.reservationCode.trim()))) {
    reject('A valid reservation code is required.');
  }
  if (command.paymentLines !== undefined) {
    if (!Array.isArray(command.paymentLines) || command.paymentLines.length > 20) reject('Payment lines are invalid.');
    const paymentLines = command.paymentLines as unknown[];
    const serviceIds = paymentLines.map((rawLine, index) => {
      if (!isPlainObject(rawLine)) reject(`Payment line ${index + 1} must be an object.`);
      const line = rawLine as Record<string, unknown>;
      if (!Number.isSafeInteger(line.serviceId) || (line.serviceId as number) < 1) reject('Payment lines must contain valid service IDs.');
      if (line.method !== 'Cash' && line.method !== 'GCash') reject('Payment lines contain an invalid payment method.');
      if (line.method === 'GCash' && (typeof line.gcashRefLast4 !== 'string' || !/^\d{4}$/.test(line.gcashRefLast4))) reject('GCash payments require a 4-digit reference.');
      return line.serviceId as number;
    });
    if (new Set(serviceIds).size !== serviceIds.length) reject('Payment lines cannot contain duplicate services.');
  }
};

export function validateOrderSyncPayload(orders: unknown): asserts orders is Record<string, unknown>[] {
  if (!Array.isArray(orders)) reject('Expected an array of orders.');
  const orderList = orders as unknown[];
  if (orderList.length > MAX_ORDER_SYNC_ITEMS) reject(`A maximum of ${MAX_ORDER_SYNC_ITEMS} orders may be synced at once.`, 413);
  orderList.forEach((rawOrder: unknown, index: number) => {
    if (!isPlainObject(rawOrder)) reject(`Order ${index + 1} must be an object.`);
    const order = rawOrder as Record<string, unknown>;
    const serialized = JSON.stringify(order);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_ORDER_SYNC_ITEM_BYTES) {
      reject(`Order ${index + 1} is too large.`, 413);
    }
    if (order.id !== undefined && (!Number.isSafeInteger(order.id) || (order.id as number) < 1)) {
      reject(`Order ${index + 1} has an invalid ID.`);
    }
    const command = order.payload === undefined ? order : parseEmbeddedPayload(order.payload);
    validateWalkInCommand(command);
  });
}

export function validateLocalQueuePayload(payload: unknown): asserts payload is Record<string, unknown> {
  if (!isPlainObject(payload)) reject('Local queue payload must be an object.');
  const localPayload = payload as Record<string, unknown>;
  const serialized = JSON.stringify(localPayload);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_LOCAL_QUEUE_PAYLOAD_BYTES) {
    reject('Local queue payload is too large.', 413);
  }
  validateWalkInCommand(localPayload);
}

export function validateSyncedIds(ids: unknown): asserts ids is number[] {
  if (!Array.isArray(ids)) reject('ids must be an array.');
  const idList = ids as unknown[];
  if (idList.length > MAX_SYNCED_IDS) reject(`A maximum of ${MAX_SYNCED_IDS} IDs may be marked at once.`, 413);
  if (idList.some((id: unknown) => !Number.isSafeInteger(id) || (id as number) < 1)) {
    reject('ids must contain positive integer IDs.');
  }
}

export function validateStockCountPayload(body: unknown): asserts body is Record<string, unknown> {
  if (!isPlainObject(body)) reject('Stock count payload must be an object.');
  const payload = body as Record<string, unknown>;

  if (typeof payload.countDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(payload.countDate.trim())) {
    reject('A valid countDate in YYYY-MM-DD format is required.');
  }
  const parsedDate = new Date(`${payload.countDate}T00:00:00Z`);
  if (Number.isNaN(parsedDate.getTime())) {
    reject('countDate is not a valid calendar date.');
  }

  const shift = payload.shift;
  if (shift !== 'morning' && shift !== 'afternoon' && shift !== 'evening') {
    reject('shift must be morning, afternoon, or evening.');
  }

  const rawLines = payload.lines;
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    reject('At least one stock count line is required.');
  }
  const lines = rawLines as unknown[];
  if (lines.length > 500) {
    reject('A maximum of 500 stock count lines can be submitted at once.', 413);
  }

  const seen = new Set<number>();
  lines.forEach((rawLine: unknown, index: number) => {
    if (!isPlainObject(rawLine)) {
      reject(`Count line ${index + 1} must be an object.`);
    }
    const line = rawLine as Record<string, unknown>;
    if (!Number.isSafeInteger(line.inventoryStockId) || (line.inventoryStockId as number) < 1) {
      reject(`Count line ${index + 1} has an invalid inventoryStockId; must be a positive integer.`);
    }
    const id = line.inventoryStockId as number;
    if (seen.has(id)) {
      reject(`Each stock item may appear only once in a count (duplicate ID: ${id}).`);
    }
    seen.add(id);

    if (
      line.countedQuantity === undefined ||
      line.countedQuantity === null ||
      !Number.isFinite(Number(line.countedQuantity)) ||
      !Number.isSafeInteger(Number(line.countedQuantity)) ||
      Number(line.countedQuantity) < 0
    ) {
      reject(`Count line ${index + 1} has an invalid countedQuantity; must be a non-negative whole integer.`);
    }

    if (line.notes !== undefined && line.notes !== null) {
      if (typeof line.notes !== 'string' || line.notes.length > 500) {
        reject(`Count line ${index + 1} notes cannot exceed 500 characters.`);
      }
    }
  });

  if (payload.notes !== undefined && payload.notes !== null) {
    if (typeof payload.notes !== 'string' || payload.notes.length > 1000) {
      reject('Stock count notes cannot exceed 1000 characters.');
    }
  }
};

export const validateBottleConsumptionQuery = (query: Record<string, unknown> = {}): void => {
  if (query.limit !== undefined && query.limit !== null && query.limit !== '') {
    const limitNum = Number(query.limit);
    if (!Number.isSafeInteger(limitNum) || limitNum < 1 || limitNum > 500) {
      reject('limit must be a positive integer between 1 and 500.');
    }
  }

  if (query.barberId !== undefined && query.barberId !== null && query.barberId !== '') {
    const barberIdNum = Number(query.barberId);
    if (!Number.isSafeInteger(barberIdNum) || barberIdNum < 1) {
      reject('barberId must be a positive integer.');
    }
  }

  if (query.inventoryStockId !== undefined && query.inventoryStockId !== null && query.inventoryStockId !== '') {
    const stockIdNum = Number(query.inventoryStockId);
    if (!Number.isSafeInteger(stockIdNum) || stockIdNum < 1) {
      reject('inventoryStockId must be a positive integer.');
    }
  }
};

