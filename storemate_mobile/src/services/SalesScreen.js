const handleCompleteSale = async (cartItems, customer) => {
  await database.write(async () => {
    // 1. Record Transaction
    await database.get('transactions').create(t => {
      t.customer_name = customer.name;
      t.phone_number = customer.phone;
      t.amount_due = cartItems.reduce((sum, i) => sum + (i.sellingPrice * i.qty), 0);
      t.is_paid = false;
    });
    
    // 2. Reduce Stock
    for (const item of cartItems) {
      const dbItem = await database.get('inventory_items').find(item.id);
      await dbItem.update(i => {
        i.quantity -= item.qty;
      });
    }
  });

  // 3. Send WhatsApp
  sendUdhariMessage(customer.name, customer.phone, cartItems, totalAmount);
};