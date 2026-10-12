"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

const DEFAULT_AVATAR = "/mindflow-icon.svg";

export const AVATAR_OPTIONS = [DEFAULT_AVATAR];

const PERSIST_KEY = "mindflow-user-profile";

const LEGACY_STORAGE_KEYS = {
  avatar: "mindflow.learnerAvatar",
  nickname: "mindflow.learnerNickname",
  bio: "mindflow.learnerBio",
} as const;

type ProfileData = {
  avatar: string;
  nickname: string;
  bio: string;
};

type ProfileActions = {
  setAvatar: (avatar: string) => void;
  setNickname: (nickname: string) => void;
  setBio: (bio: string) => void;
};

export type UserProfileStore = ProfileData & ProfileActions;

/**
 * 从旧版分散的 localStorage 键组装 persist 快照（仅在新键不存在时读一次）。
 */
function readLegacyPersistedState(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const avatar = localStorage.getItem(LEGACY_STORAGE_KEYS.avatar);
    const nickname = localStorage.getItem(LEGACY_STORAGE_KEYS.nickname);
    const bio = localStorage.getItem(LEGACY_STORAGE_KEYS.bio);
    if (!avatar && !nickname && !bio) return null;
    return JSON.stringify({
      state: {
        avatar: avatar || DEFAULT_AVATAR,
        nickname: nickname ?? "",
        bio: bio ?? "",
      },
      version: 0,
    });
  } catch {
    return null;
  }
}

const profileStorage: StateStorage = {
  getItem: (name) => {
    try {
      const current = localStorage.getItem(name);
      if (current) return current;
      if (name === PERSIST_KEY) return readLegacyPersistedState();
    } catch {
      /* ignore */
    }
    return null;
  },
  setItem: (name, value) => {
    localStorage.setItem(name, value);
  },
  removeItem: (name) => {
    localStorage.removeItem(name);
  },
};

/** 学习者头像 / 昵称 / 简介；持久化到 localStorage（Zustand persist） */
export const useUserProfileStore = create<UserProfileStore>()(
  persist(
    (set) => ({
      avatar: DEFAULT_AVATAR,
      nickname: "",
      bio: "",
      setAvatar: (avatar) => set({ avatar }),
      setNickname: (nickname) => set({ nickname }),
      setBio: (bio) => set({ bio }),
    }),
    {
      name: PERSIST_KEY,
      storage: createJSONStorage(() => profileStorage),
      partialize: (state) => ({
        avatar: state.avatar,
        nickname: state.nickname,
        bio: state.bio,
      }),
    },
  ),
);
