import type { GroupSummary } from "@repin/types";
import { generalPostCopy } from "@repin/validation";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { markWorkoutDataStale } from "../../../../../lib/data-freshness";
import {
  fetchGeneralPostDetail,
  saveGeneralPost,
} from "../../../../../lib/general-posts-api";
import { supabase } from "../../../../../lib/supabase";
import { GeneralPostComposer } from "../../../../../ui/general-post-composer";
import { colors } from "../../../../../ui/theme";

export default function EditPostScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[]; postId?: string | string[] }>();
  const groupId = Array.isArray(params.id) ? params.id[0] : params.id;
  const postId = Array.isArray(params.postId) ? params.postId[0] : params.postId;
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<Array<{
    id: string;
    localUri?: string;
    remoteUrl?: string;
    status: "uploading" | "ready" | "failed";
  }>>([]);
  const [publicationId, setPublicationId] = useState<string | null>(null);
  const [revision, setRevision] = useState(1);
  const [destinationNames, setDestinationNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void (async () => {
      if (!supabase || !groupId || !postId) return;
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) return;
      const detail = await fetchGeneralPostDetail({
        accessToken: auth.session.access_token,
        groupId,
        postId,
      });
      setBody(detail.body ?? "");
      setPublicationId(detail.publicationId);
      setRevision(detail.revision ?? 1);
      setDestinationNames(detail.destinationCrewNames ?? []);
      setPhotos(detail.photos.map((photo) => ({
        id: photo.id,
        remoteUrl: photo.url ?? undefined,
        status: "ready" as const,
      })));
    })();
  }, [groupId, postId]);

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <GeneralPostComposer
        body={body}
        destinationLocked
        destinationNames={destinationNames}
        error={error}
        groups={[] as GroupSummary[]}
        modeTitle={generalPostCopy.editPost}
        onBodyChange={setBody}
        onClose={() => router.back()}
        onPhotosChange={setPhotos}
        onPublicationIdChange={setPublicationId}
        onSelectedGroupIdsChange={() => {}}
        onSubmit={() => {
          void (async () => {
            if (!supabase || !groupId || !postId) return;
            setSubmitting(true);
            setError(null);
            try {
              const { data: auth } = await supabase.auth.getSession();
              if (!auth.session) throw new Error(generalPostCopy.postFailed);
              await saveGeneralPost({
                accessToken: auth.session.access_token,
                groupId,
                postId,
                expectedRevision: revision,
                body: body.trim() || null,
                photoIds: photos
                  .filter((photo) => photo.status === "ready")
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
        selectedGroupIds={[]}
        submitLabel={generalPostCopy.save}
        submitting={submitting}
      />
    </View>
  );
}
