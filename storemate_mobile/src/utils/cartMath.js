// src/utils/cartMath.js

/**
 * Calculates the total price of the cart.
 * Handles exact decimals for Kirana loose items (e.g., 1.5kg * ₹24 = ₹36)
 */
export const calculateCartTotal = (cartItems) => {
  return cartItems.reduce((sum, item) => {
    // Ensure we are working with clean numbers
    const price = parseFloat(item.price) || 0;
    const qty = parseFloat(item.qty) || 0;
    
    return sum + (price * qty);
  }, 0);
};

/**
 * Calculates the per-KG retail price from a bulk wholesale sack
 * e.g., 50kg sack for ₹1000 = ₹20 per kg
 */
export const calculateRetailPrice = (totalCost, totalWeightKg) => {
  if (!totalWeightKg || totalWeightKg <= 0) return 0;
  return totalCost / totalWeightKg;
};