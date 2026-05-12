import { createActor } from "./actor";
import Constants from "expo-constants";

const canisterId: string =
  (Constants.expoConfig?.extra?.canisterIds?.announcements as string | undefined) ?? "";

function idlFactory({ IDL }: { IDL: any }) {
  const Priority   = IDL.Variant({ Normal: IDL.Null, Urgent: IDL.Null });
  const Visibility = IDL.Variant({ Public: IDL.Null, Members: IDL.Null });
  const Announcement = IDL.Record({
    id:         IDL.Text,
    title:      IDL.Text,
    body:       IDL.Text,
    priority:   Priority,
    visibility: Visibility,
    postedBy:   IDL.Principal,
    postedAt:   IDL.Int,
    expiresAt:  IDL.Opt(IDL.Int),
  });

  return IDL.Service({
    getActive:              IDL.Func([], [IDL.Vec(Announcement)], ["query"]),
    getUrgent:              IDL.Func([], [IDL.Vec(Announcement)], ["query"]),
    getAll:                 IDL.Func([], [IDL.Vec(Announcement)], ["query"]),
    getPublicAnnouncements: IDL.Func([], [IDL.Vec(Announcement)], ["query"]),
  });
}

async function actor() {
  return createActor<any>(idlFactory, canisterId);
}

export type Priority   = { Normal: null } | { Urgent: null };
export type Visibility = { Public: null } | { Members: null };

export interface Announcement {
  id:         string;
  title:      string;
  body:       string;
  priority:   Priority;
  visibility: Visibility;
  postedBy:   { toText(): string };
  postedAt:   bigint;
  expiresAt:  [] | [bigint];
}

export async function getActive(): Promise<Announcement[]> {
  const a = await actor();
  if (!a) return [];
  return a.getActive();
}

export async function getUrgent(): Promise<Announcement[]> {
  const a = await actor();
  if (!a) return [];
  return a.getUrgent();
}

export async function getAll(): Promise<Announcement[]> {
  const a = await actor();
  if (!a) return [];
  return a.getAll();
}
