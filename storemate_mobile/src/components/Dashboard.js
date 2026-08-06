const totalOutstanding = await database.get('transactions')
  .query(Q.where('is_paid', false))
  .fetch();

// Sum up the amount_due field
const total = totalOutstanding.reduce((sum, t) => sum + t.amount_due, 0);