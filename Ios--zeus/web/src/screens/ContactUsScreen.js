
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, ImageBackground } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

export default function ContactUsScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ImageBackground 
        source={require('../../assets/adaptive-icon.png')} 
        style={styles.bgImage}
        blurRadius={20}
      >
          <LinearGradient colors={['rgba(0,0,0,0.6)', '#000000']} style={StyleSheet.absoluteFill} />
      </ImageBackground>
      
      <SafeAreaView style={{flex: 1}} edges={['top']}>
        <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                <Ionicons name="arrow-forward" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>تواصل معنا</Text>
            <View style={{width: 40}} /> 
        </View>

        <View style={styles.content}>
            <View style={styles.glassContainer}>
                <Ionicons name="mail-open-outline" size={60} color="#4a7cc7" style={{marginBottom: 20}} />
                <Text style={styles.text}>
                    قريباً... ستتمكن من التواصل مع فريق الدعم مباشرة من هنا.
                </Text>
            </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  bgImage: { ...StyleSheet.absoluteFillObject },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  iconBtn: { padding: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  glassContainer: { 
      backgroundColor: 'rgba(20, 20, 20, 0.75)',
      borderRadius: 20, 
      padding: 30, 
      width: '100%',
      alignItems: 'center',
      borderWidth: 1, 
      borderColor: 'rgba(255,255,255,0.1)' 
  },
  text: { color: '#ccc', fontSize: 16, textAlign: 'center', lineHeight: 24 }
});
