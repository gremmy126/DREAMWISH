import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {parsePairingLink, registerPairing, waitForPairingConfirmation} from '../services/pairing';

export function PairingScreen({url, onComplete, onCancel}: {url: string; onComplete: () => void; onCancel: () => void}) {
  const link = useMemo(() => { try { return parsePairingLink(url); } catch { return null; } }, [url]);
  const [confirmationCode, setConfirmationCode] = useState<string | null>(null);
  const [message, setMessage] = useState('휴대폰 보안 키를 준비하는 중입니다.');

  useEffect(() => {
    if (!link) { setMessage('연결 링크가 올바르지 않습니다. 웹에서 새 QR 코드를 만들어 주세요.'); return; }
    const controller = new AbortController();
    void registerPairing(link).then(async registration => {
      setConfirmationCode(registration.confirmationCode);
      setMessage('이 코드를 웹의 연결 창에 입력하세요.');
      await waitForPairingConfirmation(link, registration.keyAlias, controller.signal);
      onComplete();
    }).catch(error => {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : '연결하지 못했습니다.');
    });
    return () => controller.abort();
  }, [link, onComplete]);

  return <View style={styles.page}>
    <Text style={styles.title}>휴대폰 연결</Text>
    {confirmationCode ? <Text selectable accessibilityLabel={`확인 코드 ${confirmationCode}`} style={styles.code}>{confirmationCode}</Text> : <ActivityIndicator color="#6d4aff" size="large" />}
    <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>
    <Text style={styles.help}>코드는 웹 화면에서만 입력하세요. 앱은 P-256 개인키를 기기 보안영역 밖으로 내보내지 않습니다.</Text>
    <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={onCancel}><Text style={styles.buttonText}>취소</Text></TouchableOpacity>
  </View>;
}

const styles = StyleSheet.create({page: {flex: 1, justifyContent: 'center', padding: 24}, title: {textAlign: 'center', fontSize: 25, fontWeight: '800', color: '#111827', marginBottom: 32}, code: {fontSize: 42, letterSpacing: 12, textAlign: 'center', color: '#6d4aff', fontWeight: '900'}, message: {textAlign: 'center', marginTop: 24, color: '#374151', lineHeight: 22}, help: {marginTop: 16, color: '#6b7280', fontSize: 12, lineHeight: 18, textAlign: 'center'}, button: {minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: 30}, buttonText: {color: '#6d4aff', fontWeight: '700'}});
