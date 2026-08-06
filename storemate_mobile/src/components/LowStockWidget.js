import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Share } from 'react-native';
import { withObservables } from '@nozbe/watermelondb/react';
import { database } from '../core/database';
import { Q } from '@nozbe/watermelondb';

const LowStockWidget = ({ lowStockItems }) => {
  // If nothing is low on stock, hide the widget entirely to keep the screen clean!
  if (!lowStockItems || lowStockItems.length === 0) return null;

  // 📝 Generates a formatted text list to send to the distributor
  const handleShareReorderList = async () => {
    const textList = lowStockItems
      .map(item => `▪ ${item.productName} (Current Stock: ${item.quantity})`)
      .join('\n');
      
    const message = `*URGENT REORDER LIST* 📦\n\n${textList}\n\nPlease dispatch these items to the shop today.`;

    try {
      await Share.share({ message });
    } catch (error) {
      console.error("Error sharing reorder list:", error);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerEmoji}>⚠️</Text>
        <Text style={styles.headerText}>Low Stock Alert ({lowStockItems.length})</Text>
      </View>
      
      <FlatList
        data={lowStockItems}
        keyExtractor={item => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContainer}
        renderItem={({ item }) => (
          <View style={styles.itemCard}>
            <Text style={styles.itemName} numberOfLines={1}>{item.productName}</Text>
            <Text style={styles.itemQty}>Only {item.quantity} left</Text>
          </View>
        )}
      />

      <TouchableOpacity style={styles.reorderBtn} onPress={handleShareReorderList}>
        <Text style={styles.reorderBtnText}>📲 Send to Wholesaler</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(218, 54, 51, 0.1)', // Soft red warning background
    borderWidth: 1,
    borderColor: 'rgba(218, 54, 51, 0.3)',
    borderRadius: 14,
    padding: 16,
    marginVertical: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerEmoji: {
    fontSize: 20,
    marginRight: 8,
  },
  headerText: {
    color: '#ff7b72',
    fontSize: 18,
    fontWeight: 'bold',
  },
  listContainer: {
    paddingBottom: 10,
  },
  itemCard: {
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    padding: 10,
    marginRight: 10,
    width: 140,
  },
  itemName: {
    color: '#e6edf3',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  itemQty: {
    color: '#da3633',
    fontSize: 12,
    fontWeight: 'bold',
  },
  reorderBtn: {
    backgroundColor: '#238636',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 5,
  },
  reorderBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  }
});

// ✅ Observe only items where quantity is 5 or less
const enhance = withObservables([], () => ({
  lowStockItems: database.get('inventory_items').query(Q.where('quantity', Q.lte(5))).observe(),
}));

export default enhance(LowStockWidget);