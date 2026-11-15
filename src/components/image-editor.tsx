import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton, T } from '@/components/ui';
import { Spacing, useTheme } from '@/constants/theme';
import { FULL, dragCorner, fitContain, isFull, moveRect, toPixels, type Corner, type Rect } from '@/lib/crop';

const HANDLE = 44;

type Work = { uri: string; width: number; height: number };

async function render(uri: string, edit?: (ctx: ReturnType<typeof ImageManipulator.manipulate>) => void): Promise<Work> {
  // Loading through the manipulator also applies the photo's EXIF orientation and caps its size.
  const ctx = ImageManipulator.manipulate(uri, { maxWidth: 3000, maxHeight: 3000 });
  edit?.(ctx);
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });
  return { uri: out.uri, width: out.width, height: out.height };
}

/** A view that turns a finger drag into a change of the crop box (offsets scaled to 0..1). */
function DragArea({
  rect,
  scale,
  apply,
  onChange,
  children,
  ...viewProps
}: ViewProps & {
  rect: Rect;
  scale: { width: number; height: number };
  apply: (start: Rect, dx: number, dy: number) => Rect;
  onChange: (r: Rect) => void;
}) {
  const start = useRef<{ rect: Rect; x: number; y: number } | null>(null);
  return (
    <View
      {...viewProps}
      onStartShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e: GestureResponderEvent) => {
        start.current = { rect, x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      }}
      onResponderMove={(e: GestureResponderEvent) => {
        const st = start.current;
        if (st) onChange(apply(st.rect, (e.nativeEvent.pageX - st.x) / scale.width, (e.nativeEvent.pageY - st.y) / scale.height));
      }}
      onResponderRelease={() => {
        start.current = null;
      }}>
      {children}
    </View>
  );
}

type Props = {
  /** Image to edit; the editor is shown while this is set. */
  uri: string | null;
  /** Called with a new JPEG in the cache folder, or the original uri if nothing changed. */
  onDone: (uri: string) => void;
  onCancel: () => void;
  /** "Skip" when closing keeps the photo unedited (new photos); "Cancel" otherwise. */
  cancelLabel?: string;
};

export function ImageEditor({ uri, onDone, onCancel, cancelLabel = 'Cancel' }: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [work, setWork] = useState<Work | null>(null);
  const [rotated, setRotated] = useState(false);
  const [rect, setRect] = useState<Rect>(FULL);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!uri) return;
    setWork(null);
    setRect(FULL);
    setRotated(false);
    try {
      setWork(await render(uri));
    } catch (e) {
      Alert.alert('Could not open photo', (e as Error).message);
      onCancel();
    }
  }

  async function rotate(deg: number) {
    if (!work) return;
    setBusy(true);
    try {
      setWork(await render(work.uri, (ctx) => ctx.rotate(deg)));
      setRect(FULL);
      setRotated(true);
    } finally {
      setBusy(false);
    }
  }

  async function done() {
    if (!work || !uri) return;
    if (!rotated && isFull(rect)) return onDone(uri);
    setBusy(true);
    try {
      const out = isFull(rect) ? work : await render(work.uri, (ctx) => ctx.crop(toPixels(rect, work.width, work.height)));
      onDone(out.uri);
    } catch (e) {
      Alert.alert('Could not save photo', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const disp = work && frame.width ? fitContain(work.width, work.height, frame.width, frame.height) : null;

  const box = disp ? { left: disp.left + rect.x * disp.width, top: disp.top + rect.y * disp.height, width: rect.w * disp.width, height: rect.h * disp.height } : null;

  return (
    <Modal visible={!!uri} animationType="slide" onRequestClose={onCancel} onShow={load}>
      <View style={{ flex: 1, backgroundColor: '#000', paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View style={styles.bar}>
          <Button title={cancelLabel} variant="ghost" onPress={onCancel} />
          <T style={{ color: 'white', fontWeight: '600' }}>Crop & rotate</T>
          <Button title="Done" variant="ghost" onPress={done} disabled={!work || busy} />
        </View>

        <View style={{ flex: 1, margin: Spacing.lg }} onLayout={(e: LayoutChangeEvent) => setFrame(e.nativeEvent.layout)}>
          {work && disp && box ? (
            <>
              <Image source={{ uri: work.uri }} style={{ position: 'absolute', ...disp }} contentFit="fill" />
              {/* dim everything outside the crop box */}
              <View style={[styles.shade, { left: disp.left, top: disp.top, width: disp.width, height: box.top - disp.top }]} />
              <View style={[styles.shade, { left: disp.left, top: box.top + box.height, width: disp.width, height: disp.top + disp.height - box.top - box.height }]} />
              <View style={[styles.shade, { left: disp.left, top: box.top, width: box.left - disp.left, height: box.height }]} />
              <View style={[styles.shade, { left: box.left + box.width, top: box.top, width: disp.left + disp.width - box.left - box.width, height: box.height }]} />
              <DragArea rect={rect} scale={disp} apply={moveRect} onChange={setRect} style={[styles.box, box]} />
              {(['tl', 'tr', 'bl', 'br'] as Corner[]).map((c) => (
                <DragArea
                  key={c}
                  rect={rect}
                  scale={disp}
                  apply={(st, dx, dy) => dragCorner(st, c, dx, dy)}
                  onChange={setRect}
                  hitSlop={8}
                  style={[
                    styles.handle,
                    {
                      left: (c[1] === 'l' ? box.left : box.left + box.width) - HANDLE / 2,
                      top: (c[0] === 't' ? box.top : box.top + box.height) - HANDLE / 2,
                    },
                  ]}>
                  <View style={[styles.handleDot, { borderColor: t.primary }]} />
                </DragArea>
              ))}
            </>
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color="white" />
            </View>
          )}
          {busy ? (
            <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
              <ActivityIndicator color="white" size="large" />
            </View>
          ) : null}
        </View>

        <View style={styles.tools}>
          <IconButton name="refresh-outline" label="Rotate left" color="white" onPress={() => rotate(-90)} />
          <Button title="Reset crop" variant="ghost" onPress={() => setRect(FULL)} disabled={isFull(rect)} />
          <View style={{ transform: [{ scaleX: -1 }] }}>
            <IconButton name="refresh-outline" label="Rotate right" color="white" onPress={() => rotate(90)} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.sm },
  tools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: Spacing.md },
  shade: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
  box: { position: 'absolute', borderWidth: 2, borderColor: 'white' },
  handle: { position: 'absolute', width: HANDLE, height: HANDLE, alignItems: 'center', justifyContent: 'center' },
  handleDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'white', borderWidth: 3 },
});
