import React, {useEffect, useState} from 'react';
import {Linking, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {PairingScreen} from './screens/PairingScreen';
import {RevenueReviewScreen} from './screens/RevenueReviewScreen';
import {SettingsScreen} from './screens/SettingsScreen';
import {deviceSecurity} from './native/device-security';
import NetInfo from '@react-native-community/netinfo';
import {importIosShareEvents} from './services/ios-share-import';
import {flushOfflineQueue} from './services/device-sync';
import {bootstrapPushNotifications, installPushNavigationHandlers} from './services/push-notifications';

type Screen = {name: 'home'} | {name: 'pair'; url: string} | {name: 'revenue'; candidateId?: string} | {name: 'settings'};

export default function App() {
  const [screen, setScreen] = useState<Screen>({name: 'home'});
  const [paired, setPaired] = useState(false);

  useEffect(() => {
    void deviceSecurity.loadDeviceBinding().then(binding => setPaired(Boolean(binding)));
    const open = (url: string | null) => {
      if (!url) return;
      if (/\/companion\/pair|dreamwish:\/\/companion\/pair/u.test(url)) setScreen({name: 'pair', url});
      const match = url.match(/dreamwish:\/\/business\/revenue\/([^/?#]+)/u);
      if (match?.[1]) setScreen({name: 'revenue', candidateId: decodeURIComponent(match[1])});
    };
    void Linking.getInitialURL().then(open);
    const subscription = Linking.addEventListener('url', event => open(event.url));
    const flush = async () => { await importIosShareEvents(); await flushOfflineQueue(); };
    void flush().catch(() => undefined);
    void bootstrapPushNotifications().catch(() => undefined);
    const pushNavigationSubscription = installPushNavigationHandlers();
    const networkSubscription = NetInfo.addEventListener(state => { if (state.isConnected) void flush().catch(() => undefined); });
    return () => { subscription.remove(); networkSubscription(); pushNavigationSubscription(); };
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        {screen.name === 'pair' ? <PairingScreen url={screen.url} onComplete={() => {setPaired(true); setScreen({name: 'home'});}} onCancel={() => setScreen({name: 'home'})} /> : null}
        {screen.name === 'revenue' ? <RevenueReviewScreen candidateId={screen.candidateId} onBack={() => setScreen({name: 'home'})} /> : null}
        {screen.name === 'settings' ? <SettingsScreen paired={paired} onBack={() => setScreen({name: 'home'})} onDisconnected={() => setPaired(false)} /> : null}
        {screen.name === 'home' ? <Home paired={paired} onOpen={setScreen} /> : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Home({paired, onOpen}: {paired: boolean; onOpen: (screen: Screen) => void}) {
  return <View style={styles.page}>
    <Text style={styles.eyebrow}>DREAMWISH</Text>
    <Text style={styles.title}>Companion</Text>
    <Text style={styles.body}>{paired ? '이 휴대폰은 안전하게 연결되어 있습니다.' : '웹에서 QR 코드를 스캔해 휴대폰을 연결하세요.'}</Text>
    <TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={() => onOpen({name: 'revenue'})}><Text style={styles.primaryText}>확인 대기 매출</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" style={styles.secondary} onPress={() => onOpen({name: 'settings'})}><Text style={styles.secondaryText}>수집·알림 설정</Text></TouchableOpacity>
    <Text style={styles.notice}>iPhone은 다른 앱 알림을 자동으로 읽지 않습니다. 공유 확장으로 직접 공유한 내용만 보냅니다.</Text>
  </View>;
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#f6f7fb'}, page: {flex: 1, padding: 24, justifyContent: 'center'},
  eyebrow: {fontSize: 12, letterSpacing: 3, color: '#6d4aff', fontWeight: '800'}, title: {fontSize: 34, color: '#111827', fontWeight: '800', marginTop: 8},
  body: {fontSize: 16, lineHeight: 24, color: '#5b6473', marginTop: 12, marginBottom: 30},
  primary: {minHeight: 52, borderRadius: 18, backgroundColor: '#6d4aff', alignItems: 'center', justifyContent: 'center'}, primaryText: {color: 'white', fontWeight: '800'},
  secondary: {minHeight: 52, borderRadius: 18, borderWidth: 1, borderColor: '#dfe3eb', alignItems: 'center', justifyContent: 'center', marginTop: 12}, secondaryText: {color: '#242b38', fontWeight: '700'},
  notice: {marginTop: 24, color: '#697386', fontSize: 12, lineHeight: 19}
});
