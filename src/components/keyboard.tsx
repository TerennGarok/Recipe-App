import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Height of the on-screen keyboard (0 when hidden).
 *
 * Android apps now draw edge-to-edge, so the system no longer shrinks the screen when the
 * keyboard opens — bottom sheets and forms have to move themselves out of the way.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvt, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

/** Full-screen container whose content stays above the keyboard on both platforms. */
export function KeyboardSafeView({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const kb = useKeyboardHeight();
  if (Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView style={[{ flex: 1 }, style]} behavior="padding">
        {children}
      </KeyboardAvoidingView>
    );
  }
  return <View style={[{ flex: 1 }, style, { paddingBottom: kb }]}>{children}</View>;
}
