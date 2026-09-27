// web/src/screens/ReaderScreen.js
// Structure dispatcher for the 'Reader' route.
//
// The app ships TWO reader engines:
//   1. WebReaderScreen  — the Galaxy (wor-reader) WebView design.
//   2. NativeReaderScreen — the classic native reader (FlatList on Android /
//      lean WebView on iOS) rebuilt around the same tabbed panel design.
//
// Admins can switch between them from app settings ("هيكلية القارئ").
// The choice is stored locally and read once when the reader opens; the
// navigation call sites are untouched — they keep pushing the 'Reader' route.
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import WebReaderScreen from './WebReaderScreen';
import NativeReaderScreen from './NativeReaderScreen';

export const READER_STRUCTURE_KEY = '@reader_structure_v1';

export default function ReaderScreen(props) {
    const [structure, setStructure] = useState(null);

    useEffect(() => {
        let alive = true;
        AsyncStorage.getItem(READER_STRUCTURE_KEY)
            .then((v) => { if (alive) setStructure(v === 'native' ? 'native' : 'web'); })
            .catch(() => { if (alive) setStructure('web'); });
        return () => { alive = false; };
    }, []);

    if (structure === null) {
        return (
            <View style={styles.boot}>
                <ActivityIndicator size="large" color="#fff" />
            </View>
        );
    }

    return structure === 'native'
        ? <NativeReaderScreen {...props} />
        : <WebReaderScreen {...props} />;
}

const styles = StyleSheet.create({
    boot: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
});
