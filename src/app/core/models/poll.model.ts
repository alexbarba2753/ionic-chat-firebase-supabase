export interface PollOption {
  id: string;
  label: string;
}

export interface ChatPoll {
  id: string;
  room_id: string;
  created_by: string;
  question: string;
  options: PollOption[];
  is_closed: boolean;
  created_at?: string;
}

export interface PollVote {
  id?: number;
  poll_id: string;
  voter_uid: string;
  option_id: string;
  created_at?: string;
}
