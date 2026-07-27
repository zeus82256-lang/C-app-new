
import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

const CustomAlert = ({ visible, title, message, onCancel, onConfirm, confirmText = "تأكيد", cancelText = "إلغاء", type = "warning" }) => {
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        {/* Glass Container */}
        <View style={styles.alertBox}>
            <LinearGradient
                colors={['rgba(30, 30, 30, 0.95)', 'rgba(10, 10, 10, 0.98)']}
                style={StyleSheet.absoluteFill}
            />
            
            <View style={styles.content}>
                <View style={styles.iconContainer}>
                    <Ionicons 
                        name={type === 'danger' ? "trash-outline" : "alert-circle-outline"} 
                        size={32} 
                        color={type === 'danger' ? "#ff4444" : "#fff"} 
                    />
                </View>
                
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.message}>{message}</Text>

                <View style={styles.buttonRow}>
                    <TouchableOpacity style={styles.btn} onPress={onCancel}>
                        <Text style={styles.cancelText}>{cancelText}</Text>
                    </TouchableOpacity>
                    
                    <View style={styles.divider} />

                    <TouchableOpacity style={styles.btn} onPress={onConfirm}>
                        <Text style={[styles.confirmText, type === 'danger' && {color: '#ff4444'}]}>{confirmText}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)', // Darker dim
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40
  },
  alertBox: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 20
  },
  content: {
      alignItems: 'center',
      paddingTop: 25,
  },
  iconContainer: {
    marginBottom: 15,
  },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center'
  },
  message: {
    color: '#ccc',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 25,
    lineHeight: 20,
    paddingHorizontal: 20
  },
  buttonRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    width: '100%',
    height: 50
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  divider: {
      width: 1,
      height: '100%',
      backgroundColor: 'rgba(255,255,255,0.1)'
  },
  cancelText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '400'
  },
  confirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold'
  }
});

export default CustomAlert;
