// ANYVO CONNECT — Datentypen (Spiegel von CONNECT_SETUP.sql). Manuell gepflegt,
// da das Projekt keine Supabase-Typgenerierung nutzt.

export type ConnectVisibility = 'private' | 'friends' | 'group' | 'public';
export type ConnectProfileVisibility = 'public' | 'friends' | 'private';
export type ConnectAllowMessagesFrom = 'everyone' | 'friends' | 'none';
export type ConnectExperienceLevel = 'beginner' | 'intermediate' | 'advanced' | 'pro';
export type ConnectFriendshipStatus = 'pending' | 'accepted' | 'declined' | 'blocked';
export type ConnectPostType = 'text' | 'image' | 'video' | 'training' | 'achievement' | 'event';
export type ConnectReactionType = 'like' | 'paw';
export type ConnectConversationType = 'direct' | 'group';
export type ConnectMessageType = 'text' | 'image' | 'training' | 'event';
export type ConnectEventStatus = 'open' | 'full' | 'cancelled' | 'done';
export type ConnectParticipantStatus = 'requested' | 'accepted' | 'declined' | 'cancelled';
export type ConnectReportTarget = 'post' | 'comment' | 'message' | 'profile' | 'dog_profile' | 'event' | 'user';
export type ConnectReportReason =
  | 'spam' | 'harassment' | 'inappropriate' | 'animal_welfare' | 'misinformation' | 'privacy' | 'other';
export type ConnectReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';

export interface ConnectProfile {
  id: string;
  user_id: string;
  display_name: string | null;
  username: string | null;
  bio: string | null;
  avatar_path: string | null;
  visibility: ConnectProfileVisibility;
  discoverable: boolean;
  allow_friend_requests: boolean;
  allow_messages_from: ConnectAllowMessagesFrom;
  region_label: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConnectDogProfile {
  id: string;
  dog_id: string;
  owner_user_id: string;
  is_visible: boolean;
  bio: string | null;
  activity_tags: string[];
  experience_level: ConnectExperienceLevel | null;
  allow_training_partner_requests: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConnectFriendship {
  id: string;
  requester_user_id: string;
  addressee_user_id: string;
  status: ConnectFriendshipStatus;
  created_at: string;
  responded_at: string | null;
}

export interface ConnectPost {
  id: string;
  author_user_id: string;
  author_dog_id: string | null;
  post_type: ConnectPostType;
  visibility: ConnectVisibility;
  text_content: string | null;
  shared_training_id: string | null;
  shared_event_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ConnectPostMedia {
  id: string;
  post_id: string;
  storage_path: string;
  media_type: 'image' | 'video';
  sort_order: number;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  created_at: string;
}

export interface ConnectPostReaction {
  post_id: string;
  user_id: string;
  reaction_type: ConnectReactionType;
  created_at: string;
}

export interface ConnectPostComment {
  id: string;
  post_id: string;
  author_user_id: string;
  author_dog_id: string | null;
  text_content: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ConnectConversation {
  id: string;
  conversation_type: ConnectConversationType;
  created_by: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConnectConversationMember {
  conversation_id: string;
  user_id: string;
  joined_at: string;
  last_read_at: string | null;
  is_muted: boolean;
  left_at: string | null;
}

export interface ConnectMessage {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  sender_dog_id: string | null;
  message_type: ConnectMessageType;
  text_content: string | null;
  media_path: string | null;
  shared_training_id: string | null;
  shared_event_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

export interface ConnectTrainingEvent {
  id: string;
  creator_user_id: string;
  creator_dog_id: string | null;
  title: string;
  description: string | null;
  discipline: string | null;
  experience_level: ConnectExperienceLevel | null;
  starts_at: string | null;
  ends_at: string | null;
  region_label: string | null;
  approximate_lat: number | null;
  approximate_lng: number | null;
  max_participants: number | null;
  visibility: ConnectVisibility;
  status: ConnectEventStatus;
  created_at: string;
  updated_at: string;
}

/** Exakter Treffpunkt — nur Ersteller + bestätigte Teilnehmer (separate RLS). */
export interface ConnectEventLocation {
  event_id: string;
  exact_lat: number | null;
  exact_lng: number | null;
  meeting_point: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConnectEventParticipant {
  event_id: string;
  user_id: string;
  dog_id: string | null;
  status: ConnectParticipantStatus;
  created_at: string;
  responded_at: string | null;
}

export interface ConnectBlock {
  blocker_user_id: string;
  blocked_user_id: string;
  created_at: string;
}

export interface ConnectReport {
  id: string;
  reporter_user_id: string;
  target_type: ConnectReportTarget;
  target_id: string;
  reason: ConnectReportReason;
  details: string | null;
  status: ConnectReportStatus;
  created_at: string;
  reviewed_at: string | null;
}

export interface ConnectPrivacySettings {
  user_id: string;
  profile_visibility: ConnectProfileVisibility;
  training_visibility_default: 'private' | 'friends' | 'public';
  show_region: boolean;
  allow_message_requests: boolean;
  allow_training_requests: boolean;
  show_online_status: boolean;
  created_at: string;
  updated_at: string;
}
