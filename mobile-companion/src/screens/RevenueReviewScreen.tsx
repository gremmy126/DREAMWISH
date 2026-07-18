import React from 'react';
import {Linking, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {deviceSecurity} from '../native/device-security';

export function RevenueReviewScreen({candidateId, onBack}: {candidateId?: string; onBack: () => void}) {
  async function openWebReview() {
    const binding = await deviceSecurity.loadDeviceBinding();
    const suffix = candidateId ? `?candidateId=${encodeURIComponent(candidateId)}` : '';
    await Linking.openURL(`${binding?.apiBaseUrl || 'https://dreamwish.co.kr'}/?view=erp&tab=candidates${suffix}`);
  }
  return <View style={styles.page}>
    <Text style={styles.title}>확인 대기 매출</Text>
    <Text style={styles.body}>알림에는 금융 원문이나 계좌번호를 넣지 않습니다. 웹의 검토 화면에서 금액·방향을 확인하고 매출, 비용, 개인, 중복 또는 제외로 분류하세요.</Text>
    <TouchableOpacity style={styles.primary} onPress={() => void openWebReview()}><Text style={styles.primaryText}>안전한 웹 검토 열기</Text></TouchableOpacity>
    <TouchableOpacity style={styles.back} onPress={onBack}><Text style={styles.backText}>돌아가기</Text></TouchableOpacity>
  </View>;
}
const styles = StyleSheet.create({page: {flex: 1, justifyContent: 'center', padding: 24}, title: {fontSize: 27, fontWeight: '800', color: '#111827'}, body: {fontSize: 15, lineHeight: 24, color: '#5b6473', marginTop: 16, marginBottom: 28}, primary: {minHeight: 52, borderRadius: 18, backgroundColor: '#6d4aff', justifyContent: 'center', alignItems: 'center'}, primaryText: {color: 'white', fontWeight: '800'}, back: {minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: 12}, backText: {color: '#6d4aff', fontWeight: '700'}});
