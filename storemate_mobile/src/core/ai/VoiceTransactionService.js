import executeCommand from './CommandExecutor';

const cloneCommand = command => command && typeof command === 'object' ? { ...command } : command;

const hasConfirmation = result => Boolean(result && typeof result === 'object' && result.needsConfirmation === true);

export const executeVoiceTransaction = async ({ command, handlers = {}, context = {}, executor = executeCommand } = {}) => {
  const safeCommand = cloneCommand(command);


  console.log(
  'COUNTR DEBUG TRANSACTION HANDLERS:',
  {
    intent: safeCommand?.intent,
    handlerKeys:
      handlers
        ? Object.keys(handlers)
        : [],
    hasAddItem:
      typeof handlers?.addItem === 'function',
  }
);

  const result = await executor({
    command: safeCommand,
    handlers,
    context,
  });

  if (result && result.status === 'EXECUTED' && hasConfirmation(result.result)) {
    return {
      ...result,
      status: 'CONFIRMATION_REQUIRED',
      executed: false,
      confirmation: {
        message: result.result.message || 'Cash or Khata?',
        pendingSale: result.result.pendingSale || null,
      },
    };
  }

  return result;
};

export const createIntentHandlerHandlers = ({ executeAIAction } = {}) => {
  if (typeof executeAIAction !== 'function') {
    throw new Error('executeAIAction function is required.');
  }

  const delegate = async command => executeAIAction(command);

  return {
    saleCreate: delegate,
    khataCredit: delegate,
    khataDebit: delegate,
    khataPayment: delegate,
    inventoryAdd: delegate,
    inventoryUpdate: delegate,
    inventoryUpdatePrice: delegate,
    queryInventory: delegate,
    queryKhata: delegate,
  };
};

export const createPOSHandlers = ({ addItem, applyDiscount, checkout } = {}) => ({
  addItem,
  applyDiscount,
  checkout,
});

export default executeVoiceTransaction;