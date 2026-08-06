// __tests__/cartMath.test.js
import { calculateCartTotal, calculateRetailPrice } from '../src/utils/cartMath';

describe('Kirana Store Math Logic', () => {
  
  // TEST 1: The Decimal Weight Test
  it('correctly calculates the total for decimal weights (e.g. 1.5 KG)', () => {
    const cart = [
      { id: '1', name: 'Dal (Per KG)', price: 24, qty: 1.5 }
    ];
    
    const total = calculateCartTotal(cart);
    
    // We EXPECT 1.5kg at ₹24 to equal exactly ₹36
    expect(total).toBe(36); 
  });

  // TEST 2: Multiple Items in Cart
  it('correctly calculates the total for multiple items', () => {
    const cart = [
      { id: '1', name: 'Dal (Per KG)', price: 24, qty: 1.5 }, // ₹36
      { id: '2', name: 'Sugar (Per KG)', price: 50, qty: 0.5 }, // ₹25
      { id: '3', name: 'Parle-G', price: 10, qty: 3 } // ₹30
    ];
    
    const total = calculateCartTotal(cart);
    
    // 36 + 25 + 30 = 91
    expect(total).toBe(91);
  });

  // TEST 3: Bulk to Retail Conversion
  it('correctly calculates the Per-KG price from a bulk sack', () => {
    const totalSackCost = 1000;
    const sackWeight = 50;
    
    const pricePerKg = calculateRetailPrice(totalSackCost, sackWeight);
    
    // We EXPECT a ₹1000, 50kg sack to cost exactly ₹20 per KG
    expect(pricePerKg).toBe(20);
  });

  // TEST 4: Edge Cases (What if the user types weird stuff?)
  it('does not crash if quantity is 0 or missing', () => {
    const cart = [
      { id: '1', name: 'Error Item', price: 50, qty: 0 },
      { id: '2', name: 'Broken Item', price: 50, qty: null }
    ];
    
    const total = calculateCartTotal(cart);
    
    expect(total).toBe(0);
  });
});