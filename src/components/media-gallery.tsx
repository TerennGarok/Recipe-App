import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Dimensions, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, IconButton, T } from '@/components/ui';
import { Radius, Spacing, useTheme } from '@/constants/theme';
import { isDirectVideoFile, mediaUri } from '@/lib/media';
import type { Media } from '@/lib/types';

const { width: SCREEN_W } = Dimensions.get('window');

function VideoModal({ uri, onClose }: { uri: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(uri, (p) => p.play());
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <View style={{ flex: 1, backgroundColor: 'black', paddingTop: insets.top }}>
        <View style={{ alignItems: 'flex-end', padding: Spacing.sm }}>
          <IconButton name="close" label="Close video" color="white" onPress={onClose} />
        </View>
        <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls allowsPictureInPicture />
      </View>
    </Modal>
  );
}

function ImageModal({ uri, onClose }: { uri: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'black', paddingTop: insets.top }}>
        <View style={{ alignItems: 'flex-end', padding: Spacing.sm }}>
          <IconButton name="close" label="Close photo" color="white" onPress={onClose} />
        </View>
        <Image source={{ uri }} style={{ flex: 1 }} contentFit="contain" />
      </View>
    </Modal>
  );
}

type Props = {
  media: Media[];
  onAdd?: () => void;
  onLongPress?: (m: Media) => void;
};

export function MediaGallery({ media, onAdd, onLongPress }: Props) {
  const t = useTheme();
  const [openImage, setOpenImage] = useState<string | null>(null);
  const [openVideo, setOpenVideo] = useState<string | null>(null);
  const big = media.length <= 1;
  const w = big ? SCREEN_W - Spacing.lg * 2 : SCREEN_W * 0.7;
  const h = big ? (w * 3) / 4 : w * 0.75;

  function open(m: Media) {
    const uri = mediaUri(m);
    if (!uri) return;
    if (m.kind === 'image') setOpenImage(uri);
    else if (m.localPath || isDirectVideoFile(uri)) setOpenVideo(uri);
    else WebBrowser.openBrowserAsync(uri).catch(() => Alert.alert('Could not open video link'));
  }

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm, paddingHorizontal: Spacing.lg }}>
        {media.map((m) => {
          const uri = mediaUri(m);
          return (
            <Pressable key={m.id} onPress={() => open(m)} onLongPress={() => onLongPress?.(m)} delayLongPress={350}>
              <View style={[styles.tile, { width: w, height: h, backgroundColor: t.chip }]}>
                {m.kind === 'image' && uri ? (
                  <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
                ) : (
                  <View style={styles.videoTile}>
                    <Icon name={m.localPath || (uri && isDirectVideoFile(uri)) ? 'play-circle' : 'logo-youtube'} size={52} color={t.primary} />
                    <T kind="small" numberOfLines={1} style={{ maxWidth: w - 24 }}>
                      {m.localPath ? 'Video' : uri?.replace(/^https?:\/\/(www\.)?/, '')}
                    </T>
                  </View>
                )}
                {m.caption ? (
                  <View style={styles.caption}>
                    <T kind="small" style={{ color: 'white' }} numberOfLines={1}>
                      {m.caption}
                    </T>
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
        {onAdd ? (
          <Pressable onPress={onAdd} accessibilityLabel="Add photo or video">
            <View style={[styles.tile, styles.addTile, { width: media.length ? 120 : w, height: h, borderColor: t.border }]}>
              <Icon name="camera-outline" size={32} color={t.textSecondary} />
              <T kind="small">Add photo / video</T>
            </View>
          </Pressable>
        ) : null}
      </ScrollView>
      {openImage ? <ImageModal uri={openImage} onClose={() => setOpenImage(null)} /> : null}
      {openVideo ? <VideoModal uri={openVideo} onClose={() => setOpenVideo(null)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: Radius.lg, overflow: 'hidden' },
  videoTile: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  addTile: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs },
  caption: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: Spacing.sm, backgroundColor: 'rgba(0,0,0,0.45)' },
});
