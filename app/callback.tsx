// app/callback.tsx
import { useEffect } from 'react';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

export default function Callback() {
  useEffect(() => {
    router.back();
  }, []);
  return null;
}
