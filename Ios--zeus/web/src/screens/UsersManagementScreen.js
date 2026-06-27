
import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
  ImageBackground,
  Modal
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import CustomAlert from '../components/CustomAlert';

const formatDate = (dateString) => {
    if (!dateString) return '---';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '---';
    return date.toLocaleDateString('en-GB');
};

const GlassCard = ({ children, style }) => (
    <View style={[styles.glassCard, style]}>
        {children}
    </View>
);

export default function UsersManagementScreen({ navigation }) {
  const { showToast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Custom Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({});

  // Role Selection Modal State
  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [selectedUserForRole, setSelectedUserForRole] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/admin/users');
      setUsers(res.data);
    } catch (e) {
      showToast("فشل جلب المستخدمين", "error");
    } finally {
      setLoading(false);
    }
  };

  const handlePromote = (user) => {
      setSelectedUserForRole(user);
      setRoleModalVisible(true);
  };

  const confirmRoleChange = (newRole) => {
      if (selectedUserForRole) {
          updateUserRole(selectedUserForRole._id, newRole);
          setRoleModalVisible(false);
          setSelectedUserForRole(null);
      }
  };

  const updateUserRole = async (userId, newRole) => {
      try {
          await api.put(`/api/admin/users/${userId}/role`, { role: newRole });
          showToast(`تم تغيير الرتبة إلى ${newRole}`, "success");
          fetchUsers();
      } catch (e) { showToast("فشل التحديث", "error"); }
  };

  const handleDelete = (user) => {
      setAlertConfig({
          title: "حذف المستخدم",
          message: `هل أنت متأكد من حذف ${user.name}؟ هذا الإجراء سيحذف المستخدم وجميع أعماله نهائياً.`,
          type: 'danger',
          confirmText: "حذف نهائي",
          cancelText: "إلغاء",
          onConfirm: () => {
              setAlertVisible(false);
              performDelete(user._id, true); // Defaulting to delete content as well for cleaner DB
          }
      });
      setAlertVisible(true);
  };

  const performDelete = async (userId, deleteContent) => {
      try {
          await api.delete(`/api/admin/users/${userId}?deleteContent=${deleteContent}`);
          showToast("تم الحذف بنجاح", "success");
          fetchUsers();
      } catch (e) { showToast("فشل الحذف", "error"); }
  };

  const renderItem = ({ item }) => {
    const isContributor = item.role === 'contributor';
    const isAdmin = item.role === 'admin';

    return (
      <GlassCard style={styles.card}>
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15}}>
            {/* Actions (Left) */}
            <View style={styles.actionsContainer}>
                <TouchableOpacity onPress={() => handlePromote(item)} style={styles.actionBtn}>
                    <Ionicons name="shield-checkmark" size={20} color={isAdmin ? "#ff4444" : isContributor ? "#fff" : "#666"} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item)} style={styles.actionBtn}>
                    <Ionicons name="trash-outline" size={20} color="#ff4444" />
                </TouchableOpacity>
            </View>

            {/* Info (Middle/Right) */}
            <View style={styles.infoContainer}>
                <View style={styles.nameRow}>
                    {isAdmin && <View style={styles.roleBadge}><Text style={styles.roleText}>Admin</Text></View>}
                    {isContributor && <View style={[styles.roleBadge, {backgroundColor: 'rgba(255,255,255,0.2)'}]}><Text style={styles.roleText}>مترجم</Text></View>}
                    <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                </View>
                <View style={styles.subInfoRow}>
                    <Text style={styles.joinDate}>{formatDate(item.createdAt)}</Text>
                    <Text style={styles.separator}>|</Text>
                    <Text style={styles.email} numberOfLines={1}>{item.email}</Text>
                </View>
            </View>

            {/* Avatar (Right) */}
            <Image 
                source={item.picture ? { uri: item.picture } : require('../../assets/adaptive-icon.png')} 
                style={styles.avatar} 
                contentFit="cover"
            />
        </View>
      </GlassCard>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Custom Alert Component */}
      <CustomAlert 
        visible={alertVisible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
        onCancel={() => setAlertVisible(false)}
        onConfirm={alertConfig.onConfirm}
      />

      {/* Role Selection Modal (Glass Design) */}
      <Modal visible={roleModalVisible} transparent animationType="fade" onRequestClose={() => setRoleModalVisible(false)}>
          <TouchableOpacity 
            style={styles.modalOverlay} 
            activeOpacity={1} 
            onPress={() => setRoleModalVisible(false)}
          >
              <View style={styles.roleModalContent}>
                  <LinearGradient colors={['rgba(30, 30, 30, 0.95)', 'rgba(10, 10, 10, 0.98)']} style={StyleSheet.absoluteFill} />
                  
                  <Text style={styles.modalTitle}>تغيير الرتبة</Text>
                  <Text style={styles.modalSubtitle}>اختر الرتبة الجديدة للمستخدم {selectedUserForRole?.name}</Text>
                  
                  <TouchableOpacity style={styles.roleOption} onPress={() => confirmRoleChange('user')}>
                      <Text style={styles.roleOptionText}>مستخدم (User)</Text>
                      <Ionicons name="person-outline" size={20} color="#ccc" />
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.roleOption} onPress={() => confirmRoleChange('contributor')}>
                      <Text style={[styles.roleOptionText, {color: '#4a7cc7'}]}>مترجم / مساهم</Text>
                      <Ionicons name="book-outline" size={20} color="#4a7cc7" />
                  </TouchableOpacity>

                  <TouchableOpacity style={[styles.roleOption, {borderBottomWidth: 0}]} onPress={() => confirmRoleChange('admin')}>
                      <Text style={[styles.roleOptionText, {color: '#ff4444'}]}>مشرف عام (Admin)</Text>
                      <Ionicons name="shield-checkmark-outline" size={20} color="#ff4444" />
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.cancelButton} onPress={() => setRoleModalVisible(false)}>
                      <Text style={styles.cancelButtonText}>إلغاء</Text>
                  </TouchableOpacity>
              </View>
          </TouchableOpacity>
      </Modal>

      <ImageBackground 
        source={require('../../assets/adaptive-icon.png')} 
        style={styles.bgImage}
        blurRadius={20}
      >
          <LinearGradient colors={['rgba(0,0,0,0.6)', '#000000']} style={StyleSheet.absoluteFill} />
      </ImageBackground>
      
      <SafeAreaView style={{flex: 1}} edges={['top']}>
        <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                <Ionicons name="arrow-forward" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>إدارة المستخدمين</Text>
            <View style={{width: 40}} /> 
        </View>

        {loading ? (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color="#fff" />
            </View>
        ) : (
            <FlatList
                data={users}
                keyExtractor={item => item._id}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
            />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  bgImage: { ...StyleSheet.absoluteFillObject },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  backBtn: { padding: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },
  
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 15 },
  
  // Glass Card
  glassCard: {
      backgroundColor: 'rgba(20, 20, 20, 0.75)',
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
      marginBottom: 12
  },
  
  avatar: { width: 50, height: 50, borderRadius: 25, marginLeft: 12, backgroundColor: '#333' },
  infoContainer: { flex: 1, alignItems: 'flex-end', marginRight: 5 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  name: { color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'right' },
  roleBadge: { backgroundColor: '#ff4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  roleText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  subInfoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' },
  email: { color: '#888', fontSize: 12, maxWidth: 150, textAlign: 'right' },
  separator: { color: '#444', marginHorizontal: 6, fontSize: 12 },
  joinDate: { color: '#666', fontSize: 12 },
  actionsContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actionBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8 },

  // Role Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  roleModalContent: { width: '100%', maxWidth: 320, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', padding: 20 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 5 },
  modalSubtitle: { color: '#888', fontSize: 12, textAlign: 'center', marginBottom: 20 },
  roleOption: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)', gap: 10 },
  roleOptionText: { color: '#ccc', fontSize: 16, fontWeight: '600' },
  cancelButton: { marginTop: 15, paddingVertical: 12, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, alignItems: 'center' },
  cancelButtonText: { color: '#fff', fontWeight: 'bold' }
});
