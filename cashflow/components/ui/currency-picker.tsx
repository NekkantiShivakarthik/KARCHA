import React, { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CURRENCIES, getCurrency, setCurrency } from '@/lib/currency';

export function CurrencyPicker() {
  const [open, setOpen] = useState(false);
  const current = getCurrency();

  const label = useMemo(() => {
    const found = CURRENCIES.find((c) => c.code === current.code);
    return found ? found.label : current.code;
  }, [current.code]);

  const choose = useCallback((code: string, locale?: string) => {
    setCurrency(code, locale);
    setOpen(false);
  }, []);

  return (
    <View style={styles.container} pointerEvents="box-none">
      <Pressable style={styles.button} onPress={() => setOpen(true)}>
        <Text style={styles.buttonText}>{label}</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.title}>Choose currency</Text>
            <ScrollView contentContainerStyle={styles.list}>
              {CURRENCIES.map((c) => (
                <Pressable
                  key={c.code}
                  style={styles.item}
                  onPress={() => choose(c.code, c.locale)}>
                  <Text style={styles.itemText}>{c.label}</Text>
                  <Text style={styles.itemCode}>{c.code}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.close} onPress={() => setOpen(false)}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 50,
  },
  button: {
    backgroundColor: '#ffffffaa',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  buttonText: {
    fontSize: 12,
    color: '#111',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  list: {
    gap: 6,
  },
  item: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemText: {
    fontSize: 14,
  },
  itemCode: {
    fontSize: 12,
    color: '#666',
  },
  close: {
    marginTop: 8,
    alignSelf: 'flex-end',
    padding: 8,
  },
  closeText: {
    color: '#007aff',
  },
});

export default CurrencyPicker;
