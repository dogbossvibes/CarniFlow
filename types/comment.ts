export type CommentKind = 'text' | 'voice' | 'video';

export interface TrainingComment {
  id:         string;
  unit_id:    string;
  author_id:  string;
  kind:       CommentKind;
  body:       string | null;   // Text bzw. Transkript
  media_url:  string | null;   // Sprach-/Video-URL
  duration:   string | null;   // Länge der Sprachnachricht
  created_at: string;
}

export type NewComment = Pick<TrainingComment, 'kind' | 'body' | 'media_url' | 'duration'>;
