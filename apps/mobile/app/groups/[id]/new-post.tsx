import type { GroupSummary } from "@repin/types";
import { generalPostCopy } from "@repin/validation";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { markWorkoutDataStale } from "../../../lib/data-freshness";
import {
  createGeneralPostDraft,
  publishGeneralPost,
} from "../../../lib/general-posts-api";
import { supabase } from "../../../lib/supabase";
import { GeneralPostComposer } from "../../../ui/general-post-composer";
import { colors } from "../../../ui/theme";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default function NewPostScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const groupId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<Array<{
    id: string;
    localUri?: string;
    remoteUrl?: string;
    status: "uploading" | "ready" | "failed";
  }>>([]);
  const [publicationId, setPublicationId] = useState<string | null>(null);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(groupId ? [groupId] : []);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void (async () => {
      if (!supabase) return;
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) return;
      const search = new URLSearchParams({
        view: "community",
        feed: "mixed",
        timezoneOffsetMinutes: String(new Date().getTimezoneOffset()),
      });
      const response = await fetch(`${apiUrl}/api/home?${search.toString()}`, {
        headers: { Authorization: `Bearer ${auth.session.access_token}` },
      });
      const payload = (await response.json()) as { groups?: GroupSummary[] };
      if (Array.isArray(payload.groups)) setGroups(payload.groups);
    })();
  }, []);

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <GeneralPostComposer
        body={body}
        error={error}
        groups={groups}
        modeTitle={generalPostCopy.newPost}
        onBodyChange={setBody}
        onClose={() => router.back()}
        onPhotosChange={setPhotos}
        onPublicationIdChange={setPublicationId}
        onSelectedGroupIdsChange={setSelectedGroupIds}
        onSubmit={() => {
          void (async () => {
            if (!supabase) return;
            setSubmitting(true);
            setError(null);
            try {
              const { data: auth } = await supabase.auth.getSession();
              if (!auth.session) throw new Error(generalPostCopy.postFailed);
              let pubId = publicationId;
              if (!pubId) {
                const draft = await createGeneralPostDraft(auth.session.access_token);
                pubId = draft.publicationId;
                setPublicationId(pubId);
              }
              await publishGeneralPost({
                accessToken: auth.session.access_token,
                publicationId: pubId,
                body: body.trim() || null,
                groupIds: selectedGroupIds,
                photoIds: photos
                  .filter((photo) => photo.status === "ready" && !photo.id.startsWith("local-"))
                  .map((photo) => photo.id),
              });
              markWorkoutDataStale();
              router.back();
            } catch (submitError) {
              setError(submitError instanceof Error ? submitError.message : generalPostCopy.postFailed);
            } finally {
              setSubmitting(false);
            }
          })();
        }}
        photos={photos}
        publicationId={publicationId}
        selectedGroupIds={selectedGroupIds}
        submitLabel={generalPostCopy.post}
        submitting={submitting}
      />
    </View>
  );
}
