import {
  parseVoiceCommandLocally,
  extractProductVariant,
} from '../src/core/ai/LocalVoiceParser';

describe('COUNTR Phase 3 / 3A Local Voice Parser', () => {
  const inventory = [
    'Parle G',
    'Kurkure',
    'Tiger Biscuit',
    'Rice',
    'Basmati Rice',
    'Sugar',
    'Tooth Brush',
    'Biscuit',
  ];

  const customers = [
    'Rahul',
    'Devendra',
    'Rakesh',
  ];

  test('10 wala Kurkure = price variant, qty 1', () => {
    const r = parseVoiceCommandLocally(
      '10 wala kurkure',
      inventory,
      customers
    );

    expect(r.intent).toBe('sale.create');
    expect(r.product).toBe('Kurkure');
    expect(r.qty).toBe(1);
    expect(r.price_hint).toBe(10);
  });

  test('5 wala Tiger biscuit', () => {
    const r = parseVoiceCommandLocally(
      '5 wala tiger biscuit',
      inventory,
      customers
    );

    expect(r.product).toBe('Tiger Biscuit');
    expect(r.qty).toBe(1);
    expect(r.price_hint).toBe(5);
  });

  test('Parle G / Parle Ji / Parle Jee aliases', () => {
    for (const phrase of [
      '10 wala parle g',
      '10 wala parle ji',
      '10 wala parle jee',
    ]) {
      const r = parseVoiceCommandLocally(
        phrase,
        inventory,
        customers
      );

      expect(r.product).toBe('Parle G');
      expect(r.qty).toBe(1);
      expect(r.price_hint).toBe(10);
    }
  });

  test('100 wale basmati chawal', () => {
    const r = parseVoiceCommandLocally(
      '100 wale basmati chawal',
      inventory,
      customers
    );

    expect(r.product).toBe('Basmati Rice');
    expect(r.qty).toBe(1);
    expect(r.price_hint).toBe(100);
  });

  test('50 wala chawal 5 kilo keeps price and quantity separate', () => {
    const r = parseVoiceCommandLocally(
      '50 wala chawal 5 kilo',
      inventory,
      customers
    );

    expect(r.product).toBe('Rice');
    expect(r.qty).toBe(5);
    expect(r.unit).toBe('KG');
    expect(r.price_hint).toBe(50);
  });

  test('50 wala rice 10 kg', () => {
    const r = parseVoiceCommandLocally(
      '50 wala rice 10 kg',
      inventory,
      customers
    );

    expect(r.product).toBe('Rice');
    expect(r.qty).toBe(10);
    expect(r.unit).toBe('KG');
    expect(r.price_hint).toBe(50);
  });

  test('ek 10 wala toothbrush', () => {
    const r = parseVoiceCommandLocally(
      'ek 10 wala toothbrush',
      inventory,
      customers
    );

    expect(r.product).toBe('Tooth Brush');
    expect(r.qty).toBe(1);
    expect(r.price_hint).toBe(10);
  });

  test('Rahul khata + cash amount', () => {
    const r = parseVoiceCommandLocally(
      'rahul ke khate mein paanch sau rupaye daalo',
      inventory,
      customers
    );

    expect(r.intent).toBe('khata.credit');
    expect(r.customer_name).toBe('Rahul');
    expect(r.amount).toBe(500);
    expect(r.payment_type).toBe('KHATA');
  });

  test('Rahul khata + product quantity', () => {
    const r = parseVoiceCommandLocally(
      'rahul ke khate mein 2 kilo sugar daalo',
      inventory,
      customers
    );

    expect(r.intent).toBe('sale.create');
    expect(r.customer_name).toBe('Rahul');
    expect(r.product).toBe('Sugar');
    expect(r.qty).toBe(2);
    expect(r.unit).toBe('KG');
    expect(r.payment_type).toBe('KHATA');
  });

  test('Rahul khata + packet product', () => {
    const r = parseVoiceCommandLocally(
      'rahul ke khate mein 2 packet biscuit daalo',
      inventory,
      customers
    );

    expect(r.intent).toBe('sale.create');
    expect(r.customer_name).toBe('Rahul');
    expect(r.product).toBe('Biscuit');
    expect(r.qty).toBe(2);
    expect(r.unit).toBe('PACK');
    expect(r.payment_type).toBe('KHATA');
  });

  test('Rahul khata + price variant product', () => {
    const r = parseVoiceCommandLocally(
      'rahul ke khate mein 2 packet 10 wala parle ji daal do',
      inventory,
      customers
    );

    expect(r.intent).toBe('sale.create');
    expect(r.customer_name).toBe('Rahul');
    expect(r.product).toBe('Parle G');
    expect(r.qty).toBe(2);
    expect(r.unit).toBe('PACK');
    expect(r.price_hint).toBe(10);
    expect(r.payment_type).toBe('KHATA');
  });

  test('direct variant helper', () => {
    const r = extractProductVariant(
      '2 packet 10 wala parle ji'
    );

    expect(r.price_hint).toBe(10);
    expect(r.qty).toBe(2);
    expect(r.unit).toBe('PACK');
    expect(r.product_text).toContain('parle ji');
  });
});
