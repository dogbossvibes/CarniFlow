import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import * as Clipboard from 'expo-clipboard';

export interface ShareOptions {
  includeNotes: boolean;
  includeVideo: boolean;
  includeAudio: boolean;
  includeScore: boolean;
}

export async function createShareLink(
  trainingId: string,
  options: ShareOptions
): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht eingeloggt');

  await supabase
    .from('shared_trainings')
    .delete()
    .eq('training_id', trainingId)
    .eq('owner_id', user.id);

  const { data, error } = await supabase
    .from('shared_trainings')
    .insert({
      training_id:   trainingId,
      owner_id:      user.id,
      include_notes: options.includeNotes,
      include_video: options.includeVideo,
      include_audio: options.includeAudio,
      include_score: options.includeScore,
    })
    .select('token')
    .single();

  if (error) throw error;
  return `https://anyvo.app/share/${data.token}`;
}

export async function copyToClipboard(url: string) {
  await Clipboard.setStringAsync(url);
}

export async function shareViaSystem(url: string, title: string) {
  if (Platform.OS === 'web') {
    // Web Share API (supported in most modern browsers)
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // User cancelled or API unavailable — fall through to clipboard
      }
    }
    await copyToClipboard(url);
    return;
  }

  // Native: use expo-sharing
  const { default: Sharing } = await import('expo-sharing');
  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(url, { dialogTitle: title });
  } else {
    await copyToClipboard(url);
  }
}

export async function deleteShareLink(trainingId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase
    .from('shared_trainings')
    .delete()
    .eq('training_id', trainingId)
    .eq('owner_id', user!.id);
}
