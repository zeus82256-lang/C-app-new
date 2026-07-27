
import React, { createContext, useState, useContext, useRef } from 'react';
import { View, Text, Animated, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const ToastContext = createContext();

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }) => {
  const [toast, setToast] = useState(null); 
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(20)).current; 

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    
    opacityAnim.setValue(0);
    translateYAnim.setValue(20);

    Animated.parallel([
      Animated.timing(opacityAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.spring(translateYAnim, { toValue: 0, friction: 8, useNativeDriver: true })
    ]).start();

    setTimeout(hideToast, 3000);
  };

  const hideToast = () => {
    Animated.parallel([
      Animated.timing(opacityAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      Animated.timing(translateYAnim, { toValue: 20, duration: 250, useNativeDriver: true })
    ]).start(() => setToast(null));
  };

  const getIcon = () => {
      if (!toast) return "information-circle-outline";
      switch(toast.type) {
          case 'error': return "alert-circle-outline";
          case 'success': return "checkmark-circle-outline";
          default: return "information-circle-outline";
      }
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <View style={styles.positionContainer} pointerEvents="none">
            <Animated.View style={[styles.animWrapper, { opacity: opacityAnim, transform: [{ translateY: translateYAnim }] }]}>
                <LinearGradient
                    colors={['rgba(20, 20, 20, 0.95)', 'rgba(0, 0, 0, 0.98)']}
                    style={styles.glassContainer}
                >
                    <Ionicons name={getIcon()} size={20} color="#fff" />
                    <Text style={styles.text}>{toast.message}</Text>
                </LinearGradient>
            </Animated.View>
        </View>
      )}
    </ToastContext.Provider>
  );
};

const styles = StyleSheet.create({
  positionContainer: {
    position: 'absolute',
    bottom: 90, 
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  animWrapper: {
      maxWidth: '85%',
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.5,
      shadowRadius: 10,
      elevation: 10,
  },
  glassContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 30, // Pill shape
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    gap: 10
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center'
  }
});
