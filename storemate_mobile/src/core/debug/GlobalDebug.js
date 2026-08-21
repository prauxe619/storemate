/**
 * COUNTR - GlobalDebug
 * Controlled debugging layer.
 *
 * Purpose:
 * - Capture console logs/errors without adding console.log everywhere.
 * - Keep a small in-memory + AsyncStorage ring buffer.
 * - Capture JS errors and unhandled promise rejections.
 * - Add request/operation breadcrumbs from critical code.
 *
 * IMPORTANT:
 * This is for DEBUG builds only. Disable before production.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@countr_debug_events_v1';
const MAX_EVENTS = 500;

let enabled = true;
let installed = false;
let original = {};
let events = [];
let writeTimer = null;

const safeStringify = value => {
  try {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }

    return JSON.parse(
      JSON.stringify(value, (_, v) =>
        typeof v === 'bigint' ? String(v) : v
      )
    );
  } catch {
    try {
      return String(value);
    } catch {
      return '[Unserializable]';
    }
  }
};

const schedulePersist = () => {
  if (writeTimer) return;

  writeTimer = setTimeout(async () => {
    writeTimer = null;
    try {
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(events.slice(-MAX_EVENTS))
      );
    } catch {}
  }, 250);
};

const push = (level, tag, payload = {}) => {
  if (!enabled) return;

  const event = {
    ts: new Date().toISOString(),
    ms: Date.now(),
    level,
    tag,
    payload: safeStringify(payload),
  };

  events.push(event);

  if (events.length > MAX_EVENTS) {
    events = events.slice(-MAX_EVENTS);
  }

  schedulePersist();
};

const install = () => {
  if (installed) return;
  installed = true;

  original.log = console.log;
  original.warn = console.warn;
  original.error = console.error;

  console.log = (...args) => {
    push('INFO', 'console.log', args);
    original.log?.(...args);
  };

  console.warn = (...args) => {
    push('WARN', 'console.warn', args);
    original.warn?.(...args);
  };

  console.error = (...args) => {
    push('ERROR', 'console.error', args);
    original.error?.(...args);
  };

  const previousHandler = global.ErrorUtils?.getGlobalHandler?.();

  if (global.ErrorUtils?.setGlobalHandler) {
    global.ErrorUtils.setGlobalHandler((error, isFatal) => {
      push('FATAL', 'global.error', {
        isFatal,
        error,
      });

      if (previousHandler) {
        previousHandler(error, isFatal);
      }
    });
  }

  push('INFO', 'debug.install', {
    maxEvents: MAX_EVENTS,
    platform: 'react-native',
  });
};

const enable = value => {
  enabled = value !== false;
};

const breadcrumb = (tag, payload) => {
  push('TRACE', tag, payload);
};

const mark = (tag, payload) => {
  push('MARK', tag, payload);
};

const error = (tag, err, payload = {}) => {
  push('ERROR', tag, {
    ...payload,
    error: err,
  });
};

const getEvents = () => [...events];

const clear = async () => {
  events = [];
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {}
};

const load = async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        events = parsed.slice(-MAX_EVENTS);
      }
    }
  } catch {}
  return getEvents();
};

const exportText = () =>
  getEvents()
    .map(e => JSON.stringify(e))
    .join('\n');

const flush = async () => {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }

  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(events.slice(-MAX_EVENTS))
    );
  } catch {}
};

const wrapAsync = (tag, fn) => async (...args) => {
  const started = Date.now();

  breadcrumb(`${tag}.START`, {
    argCount: args.length,
  });

  try {
    const result = await fn(...args);

    breadcrumb(`${tag}.SUCCESS`, {
      latencyMs: Date.now() - started,
    });

    return result;
  } catch (err) {
    error(`${tag}.FAILED`, err, {
      latencyMs: Date.now() - started,
    });
    throw err;
  }
};

export default {
  install,
  enable,
  breadcrumb,
  mark,
  error,
  getEvents,
  clear,
  load,
  exportText,
  flush,
  wrapAsync,
};
