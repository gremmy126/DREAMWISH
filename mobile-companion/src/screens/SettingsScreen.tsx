import React, {useEffect, useState} from 'react';
import {Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {deviceSecurity} from '../native/device-security';
import {disablePushNotifications, enablePushNotifications, isPushNotificationsEnabled} from '../services/push-notifications';
import {revokeCurrentDevice} from '../services/device-sync';
import {clearOfflineQueue} from '../storage/offline-queue';
import {syncCalendarWithConsent, syncContactsWithConsent} from '../services/contact-calendar-sync';

export function SettingsScreen({paired, onBack, onDisconnected}: {paired: boolean; onBack: () => void; onDisconnected: () => void}) {
  const [pushEnabled, setPushEnabled] = useState(false);
  const [allowedPackages, setAllowedPackages] = useState('');
  useEffect(() => {
    if (Platform.OS === 'android') void deviceSecurity.getAllowedNotificationPackages().then(value => setAllowedPackages(value.join('\n')));
    void isPushNotificationsEnabled().then(setPushEnabled);
  }, []);
  async function togglePush() {
    if (pushEnabled) await disablePushNotifications(); else await enablePushNotifications();
    setPushEnabled(!pushEnabled);
  }
  function disconnect() {
    Alert.alert('휴대폰 연결 해제', '서버의 기기와 푸시 토큰을 폐기한 뒤 개인키와 대기 Queue를 삭제합니다.', [{text: '취소'}, {text: '해제', style: 'destructive', onPress: () => void (async () => {
      try { await revokeCurrentDevice(); await clearOfflineQueue(); await deviceSecurity.deleteDeviceBinding(); onDisconnected(); }
      catch (error) { Alert.alert('해제 실패', error instanceof Error ? error.message : '다시 시도해 주세요.'); }
    })()}]);
  }
  async function saveAllowedPackages() {
    const packages = [...new Set(allowedPackages.split(/[\s,]+/u).map(value => value.trim()).filter(value => /^[A-Za-z0-9._]+$/u.test(value)))];
    await deviceSecurity.setAllowedNotificationPackages(packages);
    Alert.alert('저장됨', `${packages.length}개 앱의 알림만 기기에서 선별합니다.`);
  }
  async function sync(kind: 'contacts' | 'calendar') {
    try {
      const result = kind === 'contacts' ? await syncContactsWithConsent() : await syncCalendarWithConsent();
      Alert.alert('동기화 완료', `${result.count}개 후보를 ${result.pending ? '암호화 대기열에 저장했습니다.' : '전송했습니다.'}`);
    } catch (error) { Alert.alert('동기화 실패', error instanceof Error ? error.message : '다시 시도해 주세요.'); }
  }
  return <ScrollView contentContainerStyle={styles.page}>
    <Text style={styles.title}>수집·알림 설정</Text>
    <Text style={styles.body}>{Platform.OS === 'ios' ? 'iPhone에서는 공유 확장으로 직접 전달한 텍스트만 수집합니다.' : 'Android에서는 알림 접근 권한과 사용자가 선택한 앱 allowlist가 모두 충족된 알림만 수집합니다.'}</Text>
    {Platform.OS === 'android' ? <View style={styles.captureBox}>
      <Text style={styles.label}>허용할 은행·결제 앱 패키지 ID</Text>
      <TextInput accessibilityLabel="허용 앱 패키지" autoCapitalize="none" autoCorrect={false} multiline value={allowedPackages} onChangeText={setAllowedPackages} placeholder={'com.example.bank\ncom.example.payment'} style={styles.input} />
      <TouchableOpacity style={styles.smallButton} onPress={() => void saveAllowedPackages()}><Text style={styles.smallButtonText}>허용 목록 저장</Text></TouchableOpacity>
      <TouchableOpacity style={styles.linkButton} onPress={() => void deviceSecurity.openNotificationAccessSettings()}><Text style={styles.linkText}>Android 알림 접근 권한 열기</Text></TouchableOpacity>
    </View> : null}
    <View style={styles.captureBox}>
      <Text style={styles.label}>명시적 데이터 동기화</Text>
      <Text style={styles.help}>버튼을 누른 경우에만 OS 권한을 요청하고, 최대 500개를 후보로 보냅니다.</Text>
      <TouchableOpacity disabled={!paired} style={styles.smallButton} onPress={() => void sync('contacts')}><Text style={styles.smallButtonText}>연락처 후보 동기화</Text></TouchableOpacity>
      <TouchableOpacity disabled={!paired} style={styles.smallButton} onPress={() => void sync('calendar')}><Text style={styles.smallButtonText}>향후 1년 일정 후보 동기화</Text></TouchableOpacity>
    </View>
    <TouchableOpacity disabled={!paired} style={styles.row} onPress={() => void togglePush()}><Text style={styles.rowText}>검토 대기 푸시 알림</Text><Text>{pushEnabled ? '켜짐' : '꺼짐'}</Text></TouchableOpacity>
    <TouchableOpacity disabled={!paired} style={styles.danger} onPress={disconnect}><Text style={styles.dangerText}>이 휴대폰 연결 해제</Text></TouchableOpacity>
    <TouchableOpacity style={styles.back} onPress={onBack}><Text style={styles.backText}>돌아가기</Text></TouchableOpacity>
  </ScrollView>;
}
const styles = StyleSheet.create({page: {flexGrow: 1, padding: 24, justifyContent: 'center'}, title: {fontSize: 27, fontWeight: '800', color: '#111827'}, body: {fontSize: 14, lineHeight: 22, color: '#5b6473', marginVertical: 22}, captureBox: {padding: 14, borderWidth: 1, borderColor: '#dfe3eb', borderRadius: 18, marginBottom: 14}, label: {fontWeight: '700', color: '#242b38', marginBottom: 8}, help: {fontSize: 12, lineHeight: 18, color: '#697386'}, input: {minHeight: 72, borderWidth: 1, borderColor: '#dfe3eb', borderRadius: 12, padding: 10, color: '#111827', textAlignVertical: 'top'}, smallButton: {minHeight: 42, borderRadius: 12, backgroundColor: '#242b38', alignItems: 'center', justifyContent: 'center', marginTop: 9}, smallButtonText: {color: 'white', fontWeight: '700'}, linkButton: {minHeight: 38, alignItems: 'center', justifyContent: 'center'}, linkText: {color: '#6d4aff', fontWeight: '700'}, row: {minHeight: 56, borderWidth: 1, borderColor: '#dfe3eb', borderRadius: 18, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}, rowText: {fontWeight: '700', color: '#242b38'}, danger: {minHeight: 52, marginTop: 14, borderRadius: 18, backgroundColor: '#fff1f2', alignItems: 'center', justifyContent: 'center'}, dangerText: {color: '#be123c', fontWeight: '800'}, back: {minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: 12}, backText: {color: '#6d4aff', fontWeight: '700'}});
