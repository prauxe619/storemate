import React from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';

export const ReviewModal = ({ visible, data, onConfirm, onCancel }) => (
  <Modal visible={visible} transparent animationType="slide">
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <Text>Confirm Extracted Items</Text>
        <FlatList 
          data={data?.line_items || []}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <TextInput style={styles.input} defaultValue={item.sku} />
              <TextInput style={styles.smallInput} defaultValue={String(item.qty)} />
            </View>
          )}
        />
        <TouchableOpacity onPress={onConfirm}><Text>Save to Stock</Text></TouchableOpacity>
        <TouchableOpacity onPress={onCancel}><Text>Cancel</Text></TouchableOpacity>
      </View>
    </View>
  </Modal>
);

// YOU MUST HAVE THIS DEFINED IN THE SAME FILE:
const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#161b22', padding: 20, borderRadius: 12 },
  row: { flexDirection: 'row', marginBottom: 10 },
  input: { flex: 2, backgroundColor: '#010409', color: '#fff', padding: 10, marginRight: 5 },
  smallInput: { flex: 1, backgroundColor: '#010409', color: '#fff', padding: 10 }
});