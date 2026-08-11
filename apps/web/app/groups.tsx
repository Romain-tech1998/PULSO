'use client';

import {
  discoverGroupsResponseSchema,
  groupChannelsResponseSchema,
  friendsResponseSchema,
  groupAttendanceSummarySchema,
  groupChecklistItemsResponseSchema,
  groupJoinRequestsResponseSchema,
  groupMembersResponseSchema,
  groupPostsResponseSchema,
  groupResponseSchema,
  groupScheduleItemsResponseSchema,
  groupsResponseSchema
} from '@pulso/contracts';
import type {
  AttendanceResponse,
  GroupChannel,
  DiscoverGroupEntry,
  Group,
  GroupAttendanceSummary,
  GroupChecklistItem,
  GroupMeetupVenue,
  GroupPost,
  GroupScheduleItem,
  GroupVisibility,
  PublicUser
} from '@pulso/contracts';
import maplibregl from 'maplibre-gl';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  API_BASE_URL,
  ATTENDANCE_LABELS,
  formatRelativeTime,
  HeartIcon,
  MAP_STYLE_URL,
  reportContent
} from './shared';

/**
 * The group workspace (DEC-0013, DEC-0015): the directory, the full-page
 * workspace, its modules, and the modal chrome the sidebar and account
 * page still open it through.
 *
 * Extracted from `explore-map.tsx`, which had grown to just under 20 000
 * lines with the group feature spread across a dozen separate places in
 * it. The move was mechanical - the components below are unchanged from
 * the versions that lived there.
 */

// Full-page home for "Groupes" (Sidebar nav item), redesigned (Phase 4.10
// follow-up) as a real split view instead of a list that pops a modal:
// the same list+sub-tabs already built for Messages' Groupes tab on the
// left, GroupDetailContent as a genuine inline panel on the right - no
// GroupModal here. GroupsBlock (still a modal) stays as-is for the
// narrower contexts that still use it (sidebar mini-list, Profil tab).
export function GroupsPage({
  authToken,
  userId,
  onOpenEventForum
}: {
  authToken: string | undefined;
  userId: string;
  onOpenEventForum: (eventId: string) => void;
}) {
  const [selectedGroup, setSelectedGroup] = useState<Group>();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<GroupVisibility>('open');
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [listVersion, setListVersion] = useState(0);

  const createGroup = () => {
    if (!authToken || !name.trim() || creating) return;
    setCreating(true);
    fetch(`${API_BASE_URL}/me/groups`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        name: name.trim(),
        visibility,
        ...(description.trim() ? { description: description.trim() } : {})
      })
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setName('');
        setDescription('');
        setVisibility('open');
        setCreateOpen(false);
        setListVersion((version) => version + 1);
        setSelectedGroup(groupResponseSchema.parse(json).data);
      })
      .catch(() => {})
      .finally(() => setCreating(false));
  };

  if (selectedGroup) {
    return (
      <div className="groups-page groups-page-open">
        <div className="groups-open-bar">
          <button
            type="button"
            className="groups-open-back"
            onClick={() => setSelectedGroup(undefined)}
          >
            <span aria-hidden="true">←</span>
            Groupes
          </button>
        </div>
        <div className="groups-open-workspace">
          <GroupDetailContent
            group={selectedGroup}
            authToken={authToken}
            userId={userId}
            onGroupUpdated={setSelectedGroup}
            onLeave={() => setSelectedGroup(undefined)}
            onOpenEventForum={onOpenEventForum}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="messages-page groups-page">
      <div className="messages-list-column groups-directory-column">
        <header className="groups-page-header">
          <div>
            <span className="groups-page-eyebrow">Communautés Pulso</span>
            <h1>Groupes</h1>
            <p>Des espaces conçus pour passer de l’idée à la sortie.</p>
          </div>
          <button
            type="button"
            className={`groups-create-trigger ${createOpen ? 'active' : ''}`}
            onClick={() => setCreateOpen((open) => !open)}
            aria-expanded={createOpen}
          >
            <span aria-hidden="true">+</span>
            Créer
          </button>
        </header>
        {createOpen && (
          <form
            className="groups-create-form"
            onSubmit={(event) => {
              event.preventDefault();
              createGroup();
            }}
          >
            <div className="groups-create-form-heading">
              <div>
                <span className="groups-page-eyebrow">Nouveau groupe</span>
                <strong>Crée ton espace d’organisation</strong>
              </div>
              <button
                type="button"
                className="text-btn"
                onClick={() => setCreateOpen(false)}
              >
                Fermer
              </button>
            </div>
            <label className="groups-create-field">
              <span>Nom du groupe</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex. Français à Montréal"
                maxLength={80}
                autoFocus
              />
            </label>
            <label className="groups-create-field">
              <span>Mission du groupe</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="À qui s’adresse le groupe et comment souhaitez-vous organiser les sorties ?"
                maxLength={500}
                rows={3}
              />
              <small>{description.length}/500</small>
            </label>
            <fieldset className="groups-visibility-choice">
              <legend>Comment peut-on rejoindre ?</legend>
              <label className={visibility === 'open' ? 'active' : ''}>
                <input
                  type="radio"
                  name="group-visibility"
                  checked={visibility === 'open'}
                  onChange={() => setVisibility('open')}
                />
                <span className="groups-visibility-icon" aria-hidden="true">
                  ◎
                </span>
                <span>
                  <strong>Accès libre</strong>
                  <small>Visible et accessible immédiatement.</small>
                </span>
              </label>
              <label className={visibility === 'restricted' ? 'active' : ''}>
                <input
                  type="radio"
                  name="group-visibility"
                  checked={visibility === 'restricted'}
                  onChange={() => setVisibility('restricted')}
                />
                <span className="groups-visibility-icon" aria-hidden="true">
                  ◇
                </span>
                <span>
                  <strong>Sur demande</strong>
                  <small>
                    Visible, mais chaque entrée doit être approuvée.
                  </small>
                </span>
              </label>
            </fieldset>
            <button
              type="submit"
              className="groups-create-submit"
              disabled={creating || !name.trim()}
            >
              {creating ? 'Création…' : 'Créer le groupe'}
            </button>
          </form>
        )}
        <MessagesGroupsTab
          key={listVersion}
          authToken={authToken}
          // Nothing is selected on this branch: picking a group returns the
          // full-page workspace above instead of highlighting a row here.
          selectedGroupId={undefined}
          onSelectGroup={setSelectedGroup}
        />
      </div>

      <div className="messages-conversation-column groups-workspace-column">
        {
          <div className="groups-workspace-empty">
            <div className="groups-workspace-empty-copy">
              <span className="groups-page-eyebrow">Ton espace collectif</span>
              <h2>Organiser une sortie ne devrait jamais être compliqué.</h2>
              <p>
                Ouvre un groupe pour retrouver au même endroit les décisions, le
                programme, les présences, les tâches et la discussion.
              </p>
              <button
                type="button"
                className="groups-create-submit"
                onClick={() => setCreateOpen(true)}
              >
                Créer mon premier groupe
              </button>
            </div>
            <div
              className="groups-workspace-modules"
              aria-label="Modules disponibles"
            >
              <span>
                <b>01</b> Programme partagé
              </span>
              <span>
                <b>02</b> Présences réelles
              </span>
              <span>
                <b>03</b> Checklist collective
              </span>
              <span>
                <b>04</b> Discussion du groupe
              </span>
            </div>
          </div>
        }
      </div>
    </div>
  );
}

// "Groupes" tab - same real data as GroupsBlock (GET /me/groups), just a
// second, convenient entry point into the same GroupModal rather than a
// separate group-messaging concept.
type GroupsSubTab = 'mine' | 'event' | 'discover';

// Groupes tab inside Messages (Phase 4.10) - three sub-tabs matching the
// mockup: "Mes groupes" (already-joined), "Groupes de l'événement" (every
// event-linked group, joined or not) and "Découvrir" (the permanent-group
// directory DEC-0013 v1.1 pre-authorized). Selecting a row opens the real
// group inline in the right column via onSelectGroup, same pattern as
// picking a conversation.
export function MessagesGroupsTab({
  authToken,
  selectedGroupId,
  onSelectGroup
}: {
  authToken: string | undefined;
  selectedGroupId: string | undefined;
  onSelectGroup: (group: Group) => void;
}) {
  const [subTab, setSubTab] = useState<GroupsSubTab>('mine');
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [eventGroups, setEventGroups] = useState<DiscoverGroupEntry[]>([]);
  const [discoverGroups, setDiscoverGroups] = useState<DiscoverGroupEntry[]>(
    []
  );
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!authToken) return;
    setState('loading');
    const request =
      subTab === 'mine'
        ? fetch(`${API_BASE_URL}/me/groups`, {
            headers: { authorization: `Bearer ${authToken}` }
          })
            .then((response) =>
              response.ok ? response.json() : Promise.reject()
            )
            .then((json) => setMyGroups(groupsResponseSchema.parse(json).data))
        : fetch(
            `${API_BASE_URL}/groups/discover?scope=${subTab === 'event' ? 'event' : 'permanent'}`,
            { headers: { authorization: `Bearer ${authToken}` } }
          )
            .then((response) =>
              response.ok ? response.json() : Promise.reject()
            )
            .then((json) => {
              const data = discoverGroupsResponseSchema.parse(json).data;
              if (subTab === 'event') setEventGroups(data);
              else setDiscoverGroups(data);
            });
    request.then(() => setState('success')).catch(() => setState('error'));
  }, [authToken, subTab]);

  const openGroup = useCallback(
    (groupId: string) => {
      if (!authToken) return;
      fetch(`${API_BASE_URL}/groups/${groupId}`, {
        headers: { authorization: `Bearer ${authToken}` }
      })
        .then((response) => (response.ok ? response.json() : Promise.reject()))
        .then((json) => onSelectGroup(groupResponseSchema.parse(json).data))
        .catch(() => undefined);
    },
    [authToken, onSelectGroup]
  );

  const rows: DiscoverGroupEntry[] =
    subTab === 'mine'
      ? myGroups.map((group) => ({ group }))
      : subTab === 'event'
        ? eventGroups
        : discoverGroups;
  const visibleRows = query.trim()
    ? rows.filter(({ group, event }) => {
        const haystack = `${group.name} ${group.description ?? ''} ${event?.title ?? ''}`;
        return haystack.toLowerCase().includes(query.trim().toLowerCase());
      })
    : rows;

  return (
    <div className="messages-tab-panel groups-directory-panel">
      <div className="details-tabs groups-sub-tabs">
        <button
          type="button"
          className={subTab === 'mine' ? 'active' : ''}
          onClick={() => setSubTab('mine')}
        >
          Mes groupes
        </button>
        <button
          type="button"
          className={subTab === 'event' ? 'active' : ''}
          onClick={() => setSubTab('event')}
        >
          Événements
        </button>
        <button
          type="button"
          className={subTab === 'discover' ? 'active' : ''}
          onClick={() => setSubTab('discover')}
        >
          Découvrir
        </button>
      </div>

      <div className="groups-directory-context">
        <div>
          <strong>
            {subTab === 'mine'
              ? 'Tes espaces'
              : subTab === 'event'
                ? 'Autour des événements'
                : 'Communautés à découvrir'}
          </strong>
          <span>
            {subTab === 'mine'
              ? 'Tous les groupes que tu as rejoints.'
              : subTab === 'event'
                ? 'Des groupes créés pour préparer une sortie précise.'
                : 'Des communautés montréalaises ouvertes ou sur demande.'}
          </span>
        </div>
        <span className="groups-directory-count">{rows.length}</span>
      </div>
      <label className="groups-directory-search">
        <span aria-hidden="true">⌕</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher un groupe"
          aria-label="Rechercher un groupe"
        />
      </label>

      {state === 'loading' && <p className="list-view-empty">Chargement…</p>}
      {state === 'error' && (
        <p className="list-view-empty">
          Impossible de charger les groupes pour le moment.
        </p>
      )}
      {state === 'success' && rows.length === 0 && (
        <p className="list-view-empty">
          {subTab === 'mine'
            ? 'Aucun groupe pour le moment. Découvre-en un dans l\'onglet Découvrir, ou rejoins-en un depuis "Rencontrer avant l\'événement" sur un forum.'
            : subTab === 'event'
              ? "Aucun groupe d'événement pour le moment."
              : 'Aucun groupe permanent pour le moment.'}
        </p>
      )}
      {state === 'success' && rows.length > 0 && visibleRows.length === 0 && (
        <p className="list-view-empty">
          Aucun groupe ne correspond à ta recherche.
        </p>
      )}
      <div className="friends-list groups-directory-list">
        {visibleRows.map(({ group, event }) => (
          <button
            type="button"
            key={group.id}
            className={`conversation-list-row ${selectedGroupId === group.id ? 'selected' : ''}`}
            onClick={() => openGroup(group.id)}
          >
            <GroupAvatar
              group={group}
              className="friends-row-avatar-lg group-directory-avatar"
            />
            <span className="conversation-list-info">
              <span className="conversation-list-row-top">
                <strong>
                  {group.name}
                  {group.verificationStatus === 'verified' && (
                    <VerifiedBadge compact />
                  )}
                </strong>
                {group.isModerator && (
                  <span className="group-directory-admin">Administrateur</span>
                )}
                <span className="group-directory-access">
                  {group.visibility === 'restricted' ? 'Sur demande' : 'Libre'}
                </span>
              </span>
              {group.description && (
                <span className="group-directory-description">
                  {group.description}
                </span>
              )}
              <span className="group-directory-meta">
                <span>
                  {group.memberCount} membre{group.memberCount > 1 ? 's' : ''}
                </span>
                <span>{event ? 'Groupe événement' : 'Communauté'}</span>
              </span>
              {event && (
                <span className="group-directory-event">
                  {event.title} ·{' '}
                  {new Date(event.startsAt).toLocaleDateString('fr-CA', {
                    day: 'numeric',
                    month: 'short'
                  })}
                </span>
              )}
            </span>
            {group.isModerator &&
              group.pendingRequestCount !== undefined &&
              group.pendingRequestCount > 0 && (
                <span className="conversation-list-badge">
                  {group.pendingRequestCount}
                </span>
              )}
          </button>
        ))}
      </div>
    </div>
  );
}

// Own block for the same reason as FriendsBlock above: its own
// fetch/mutate cycle, only renders once signed in. Group membership here
// is always self-service (DEC-0013) - no invite/approval step to model.
export function GroupsBlock({
  authToken,
  userId
}: {
  authToken: string | undefined;
  userId: string;
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<GroupVisibility>('open');
  const [creating, setCreating] = useState(false);
  const [openGroup, setOpenGroup] = useState<Group>();

  const refresh = useCallback(() => {
    if (!authToken) return;
    setLoadState('loading');
    fetch(`${API_BASE_URL}/me/groups`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setGroups(groupsResponseSchema.parse(json).data);
        setLoadState('success');
      })
      .catch(() => setLoadState('error'));
  }, [authToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createGroup = () => {
    if (!authToken || !name.trim() || creating) return;
    setCreating(true);
    fetch(`${API_BASE_URL}/me/groups`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        name: name.trim(),
        visibility,
        ...(description.trim() ? { description: description.trim() } : {})
      })
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(() => {
        setName('');
        setDescription('');
        setVisibility('open');
        refresh();
      })
      .catch(() => {})
      .finally(() => setCreating(false));
  };

  return (
    <div className="compte-block">
      <h3>Mes groupes</h3>
      {loadState === 'loading' && (
        <p className="list-view-empty">Chargement…</p>
      )}
      {loadState === 'error' && (
        <p className="list-view-empty">
          Impossible de charger vos groupes pour le moment.
        </p>
      )}
      {loadState === 'success' && (
        <div className="friends-block">
          <form
            className="friends-add-form groups-create-form"
            onSubmit={(event) => {
              event.preventDefault();
              createGroup();
            }}
          >
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nom du groupe"
              maxLength={80}
            />
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Description (optionnel)"
              maxLength={500}
            />
            <div className="groups-visibility-choice">
              <label>
                <input
                  type="radio"
                  name="group-visibility"
                  checked={visibility === 'open'}
                  onChange={() => setVisibility('open')}
                />
                Accès libre — tout le monde peut rejoindre
              </label>
              <label>
                <input
                  type="radio"
                  name="group-visibility"
                  checked={visibility === 'restricted'}
                  onChange={() => setVisibility('restricted')}
                />
                Accès limité — sur demande, approuvée par toi
              </label>
            </div>
            <button
              type="submit"
              className="btn-secondary"
              disabled={creating || !name.trim()}
            >
              Créer
            </button>
          </form>

          <div className="friends-list">
            {groups.length === 0 && (
              <p className="list-view-empty">Aucun groupe pour le moment.</p>
            )}
            {groups.map((group) => (
              <div className="friends-row" key={group.id}>
                <span className="friends-row-name">
                  {group.name}
                  <span className="compte-trends-count">
                    {group.memberCount}
                  </span>
                </span>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => setOpenGroup(group)}
                >
                  Ouvrir
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {openGroup && (
        <GroupModal
          group={openGroup}
          authToken={authToken}
          userId={userId}
          onClose={() => setOpenGroup(undefined)}
          onLeft={() => {
            setOpenGroup(undefined);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// Phase 4.10 ("Groupes avancés") - the rich detail content shared by the
// modal chrome (GroupModal, unchanged call sites: sidebar mini-list,
// GroupsBlock, ForumPanel's meetup flow) and the new inline pane inside
// Messages' "Groupes" tabs. Everything here is real: member avatars/count,
// a moderator's real pending-request queue, a meetup point derived from
// the linked event's actual venue, and member-added schedule/attendance/
// checklist modules - no online presence, no kick/removal, no content
// moderation beyond the existing author-only delete (DEC-0013 v1.2).
type GroupDetailTab = 'organize' | 'discussion' | 'members' | 'manage';


/**
 * A group's face. Its uploaded photo when it has one, its initial when it
 * does not - never a stock image standing in for a picture the group never
 * chose (the same rule the event carousel already follows).
 */
export function GroupAvatar({
  group,
  className
}: {
  group: Pick<Group, 'name' | 'imageUrl'>;
  className?: string;
}) {
  return (
    <span className={`group-avatar ${className ?? ''}`}>
      {group.imageUrl ? (
        <img src={group.imageUrl} alt="" />
      ) : (
        group.name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

// Granted by a Pulso administrator, never self-awarded - so it is only
// rendered for a group whose request was actually approved.
function VerifiedBadge({ compact }: { compact?: boolean }) {
  return (
    <span
      className={`group-verified-badge ${compact ? 'compact' : ''}`}
      title="Groupe vérifié par Pulso"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 2l2.4 1.8 3-.3 1 2.8 2.6 1.5-1 2.9 1 2.9-2.6 1.5-1 2.8-3-.3L12 22l-2.4-1.8-3 .3-1-2.8L3 16.2l1-2.9-1-2.9 2.6-1.5 1-2.8 3 .3z"
        />
        <path
          fill="none"
          stroke="#100e19"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.5 12.2l2.4 2.4 4.6-4.9"
        />
      </svg>
      {!compact && <span>Vérifié</span>}
    </span>
  );
}

/**
 * The group's identity, editable by its moderator: the photo, and the
 * verification request. Verification is asked for, never taken - a Pulso
 * administrator decides, the same request/approve shape DEC-0018 uses for
 * organizer accounts.
 */
function GroupIdentityCard({
  group,
  authToken,
  onGroupUpdated
}: {
  group: Group;
  authToken: string | undefined;
  onGroupUpdated: (group: Group) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [justification, setJustification] = useState('');
  const [askOpen, setAskOpen] = useState(false);

  const uploadPhoto = (file: File) => {
    if (!authToken || busy) return;
    setBusy(true);
    setError(undefined);
    const body = new FormData();
    body.append('photo', file);
    fetch(`${API_BASE_URL}/groups/${group.id}/photo`, {
      method: 'POST',
      headers: { authorization: `Bearer ${authToken}` },
      body
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(response)))
      .then((json) => onGroupUpdated(groupResponseSchema.parse(json).data))
      .catch(async (response: Response) => {
        setError(
          response?.status === 415
            ? 'Format non supporté. Utilise JPEG, PNG, WebP ou GIF.'
            : response?.status === 413
              ? 'Photo trop lourde.'
              : "La photo n'a pas pu être enregistrée."
        );
      })
      .finally(() => setBusy(false));
  };

  const removePhoto = () => {
    if (!authToken || busy) return;
    setBusy(true);
    fetch(`${API_BASE_URL}/groups/${group.id}/photo`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) =>
        response.ok
          ? onGroupUpdated({ ...group, imageUrl: undefined })
          : Promise.reject()
      )
      .catch(() => setError("La photo n'a pas pu être retirée."))
      .finally(() => setBusy(false));
  };

  const askVerification = () => {
    if (!authToken || busy || !justification.trim()) return;
    setBusy(true);
    fetch(`${API_BASE_URL}/groups/${group.id}/verification-request`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ justification: justification.trim() })
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        onGroupUpdated(groupResponseSchema.parse(json).data);
        setAskOpen(false);
        setJustification('');
      })
      .catch(() => setError("La demande n'a pas pu être envoyée."))
      .finally(() => setBusy(false));
  };

  return (
    <div className="group-detail-card group-identity-card">
      <div className="group-identity-photo">
        <GroupAvatar group={group} className="group-avatar-xl" />
        <div className="group-identity-photo-actions">
          <strong>Photo du groupe</strong>
          <p>Elle apparaît partout où le groupe est listé.</p>
          <div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
            >
              {group.imageUrl ? 'Remplacer' : 'Ajouter une photo'}
            </button>
            {group.imageUrl && (
              <button
                type="button"
                className="text-btn"
                onClick={removePhoto}
                disabled={busy}
              >
                Retirer
              </button>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            hidden
            onChange={(changeEvent) => {
              const file = changeEvent.target.files?.[0];
              if (file) uploadPhoto(file);
              changeEvent.target.value = '';
            }}
          />
        </div>
      </div>

      <div className="group-identity-verification">
        <div className="group-identity-verification-head">
          <strong>Vérification Pulso</strong>
          {group.verificationStatus === 'verified' && <VerifiedBadge />}
        </div>
        {group.verificationStatus === 'verified' && (
          <p>
            Ce groupe est vérifié. Le badge est visible partout où il
            apparaît.
          </p>
        )}
        {group.verificationStatus === 'pending' && (
          <p>Demande envoyée. Une équipe Pulso va l’examiner.</p>
        )}
        {group.verificationStatus === 'declined' && (
          <p>
            La demande précédente n’a pas été retenue. Tu peux en soumettre
            une nouvelle.
          </p>
        )}
        {group.verificationStatus !== 'verified' &&
          group.verificationStatus !== 'pending' &&
          !askOpen && (
            <>
              <p>
                Un groupe vérifié inspire confiance aux personnes qui ne le
                connaissent pas encore.
              </p>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setAskOpen(true)}
              >
                Demander la vérification
              </button>
            </>
          )}
        {askOpen && (
          <form
            className="group-verification-form"
            onSubmit={(submitEvent) => {
              submitEvent.preventDefault();
              askVerification();
            }}
          >
            <label>
              <span>Qui êtes-vous et que fait ce groupe ?</span>
              <textarea
                value={justification}
                onChange={(changeEvent) =>
                  setJustification(changeEvent.target.value)
                }
                maxLength={500}
                rows={3}
                placeholder="Ex. Collectif techno actif depuis 2019, 40 soirées par an au Plateau."
                autoFocus
              />
              <small>{justification.length}/500</small>
            </label>
            <div className="group-verification-form-actions">
              <button
                type="button"
                className="text-btn"
                onClick={() => setAskOpen(false)}
              >
                Annuler
              </button>
              <button
                type="submit"
                className="groups-create-submit"
                disabled={busy || !justification.trim()}
              >
                {busy ? 'Envoi…' : 'Envoyer la demande'}
              </button>
            </div>
          </form>
        )}
        {error && <p className="group-identity-error">{error}</p>}
      </div>
    </div>
  );
}

export function GroupDetailContent({
  group,
  authToken,
  userId,
  onGroupUpdated,
  onLeave,
  onOpenEventForum
}: {
  group: Group;
  authToken: string | undefined;
  userId: string;
  onGroupUpdated: (group: Group) => void;
  onLeave?: () => void;
  onOpenEventForum?: (eventId: string) => void;
}) {
  const [posts, setPosts] = useState<GroupPost[]>([]);
  const [postsState, setPostsState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(
    new Set()
  );
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [members, setMembers] = useState<PublicUser[]>([]);
  const [channels, setChannels] = useState<GroupChannel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>();
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelStaffOnly, setNewChannelStaffOnly] = useState(false);
  const [addingChannel, setAddingChannel] = useState(false);
  const [joining, setJoining] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [tab, setTab] = useState<GroupDetailTab>('organize');

  useEffect(() => {
    setTab('organize');
  }, [group.id]);

  const refreshPosts = useCallback(() => {
    if (!authToken || !group.isMember || !activeChannelId) return;
    setPostsState('loading');
    fetch(
      `${API_BASE_URL}/groups/${group.id}/posts?channelId=${activeChannelId}`,
      { headers: { authorization: `Bearer ${authToken}` } }
    )
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setPosts(groupPostsResponseSchema.parse(json).data);
        setPostsState('success');
      })
      .catch(() => setPostsState('error'));
  }, [authToken, group.id, group.isMember, activeChannelId]);

  // The thread list, and the thread currently being read. Selecting the
  // first one by default keeps the pre-channel behaviour for a group that
  // only ever had one conversation.
  const refreshChannels = useCallback(() => {
    if (!authToken || !group.isMember) return;
    fetch(`${API_BASE_URL}/groups/${group.id}/channels`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        const data = groupChannelsResponseSchema.parse(json).data;
        setChannels(data);
        setActiveChannelId((current) =>
          current && data.some((channel) => channel.id === current)
            ? current
            : data[0]?.id
        );
      })
      .catch(() => {});
  }, [authToken, group.id, group.isMember]);

  useEffect(() => {
    refreshChannels();
  }, [refreshChannels]);

  const activeChannel = channels.find(
    (channel) => channel.id === activeChannelId
  );
  // A staff-only thread is readable by everyone and writable by the
  // moderator alone - the server enforces the same rule.
  const canWriteHere = !activeChannel?.staffOnly || group.isModerator;

  const addChannel = () => {
    if (!authToken || !newChannelName.trim() || addingChannel) return;
    setAddingChannel(true);
    fetch(`${API_BASE_URL}/groups/${group.id}/channels`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        name: newChannelName.trim(),
        staffOnly: newChannelStaffOnly
      })
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(() => {
        setNewChannelName('');
        setNewChannelStaffOnly(false);
        refreshChannels();
      })
      .catch(() => {})
      .finally(() => setAddingChannel(false));
  };

  const removeChannel = (channelId: string) => {
    if (!authToken) return;
    void fetch(`${API_BASE_URL}/groups/${group.id}/channels/${channelId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${authToken}` }
    }).then(() => {
      if (channelId === activeChannelId) setActiveChannelId(undefined);
      refreshChannels();
    });
  };

  useEffect(() => {
    refreshPosts();
  }, [refreshPosts]);

  useEffect(() => {
    if (!authToken) return;
    fetch(`${API_BASE_URL}/groups/${group.id}/members`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => setMembers(groupMembersResponseSchema.parse(json).data))
      .catch(() => {});
  }, [authToken, group.id]);

  const refreshGroup = useCallback(() => {
    if (!authToken) return;
    fetch(`${API_BASE_URL}/groups/${group.id}`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => onGroupUpdated(groupResponseSchema.parse(json).data))
      .catch(() => {});
  }, [authToken, group.id, onGroupUpdated]);

  const joinGroupAction = () => {
    if (!authToken || joining) return;
    setJoining(true);
    fetch(`${API_BASE_URL}/groups/${group.id}/members`, {
      method: 'POST',
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(() => refreshGroup())
      .catch(() => {})
      .finally(() => setJoining(false));
  };

  const leaveGroupAction = () => {
    if (!authToken) return;
    void fetch(`${API_BASE_URL}/groups/${group.id}/members`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${authToken}` }
    }).then(() => {
      if (onLeave) onLeave();
      else refreshGroup();
    });
  };

  // Phase 4.14 - which groups show in the sidebar shortcut list is the
  // member's own choice, not "every group I've joined". Optimistic: the
  // route returns 204, there's nothing to reconcile against.
  const [pinning, setPinning] = useState(false);
  const togglePin = () => {
    if (!authToken || pinning) return;
    setPinning(true);
    const nextPinned = !group.pinned;
    fetch(`${API_BASE_URL}/groups/${group.id}/pin`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ pinned: nextPinned })
    })
      .then((response) =>
        response.ok
          ? onGroupUpdated({ ...group, pinned: nextPinned })
          : Promise.reject()
      )
      .catch(() => {})
      .finally(() => setPinning(false));
  };

  const submitPost = (parentId?: string) => {
    const body = (parentId ? replyDrafts[parentId] : draft)?.trim();
    if (!authToken || !body || posting) return;
    setPosting(true);
    fetch(`${API_BASE_URL}/groups/${group.id}/posts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        body,
        ...(parentId ? { parentId } : {}),
        ...(activeChannelId ? { channelId: activeChannelId } : {})
      })
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(() => {
        if (parentId) {
          setReplyDrafts((prev) => ({ ...prev, [parentId]: '' }));
          setExpandedReplies((prev) => new Set(prev).add(parentId));
        } else {
          setDraft('');
        }
        refreshPosts();
      })
      .catch(() => {})
      .finally(() => setPosting(false));
  };

  const removePost = (postId: string) => {
    if (!authToken) return;
    void fetch(`${API_BASE_URL}/groups/${group.id}/posts/${postId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${authToken}` }
    }).then(() => refreshPosts());
  };

  const toggleLike = (post: GroupPost) => {
    if (!authToken) return;
    setPosts((prev) =>
      prev.map((candidate) =>
        candidate.id === post.id
          ? {
              ...candidate,
              likedByMe: !candidate.likedByMe,
              likeCount: candidate.likeCount + (candidate.likedByMe ? -1 : 1)
            }
          : candidate
      )
    );
    fetch(`${API_BASE_URL}/groups/${group.id}/posts/${post.id}/like`, {
      method: post.likedByMe ? 'DELETE' : 'POST',
      headers: { authorization: `Bearer ${authToken}` }
    }).catch(() => refreshPosts());
  };

  const toggleExpanded = (postId: string) => {
    setExpandedReplies((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  };

  const topLevelPosts = posts.filter((post) => !post.parentId);
  const repliesFor = (postId: string) =>
    posts.filter((post) => post.parentId === postId);

  return (
    <div className="group-detail">
      <div className="group-detail-header">
        <div
          className={`group-detail-cover ${group.imageUrl ? 'has-photo' : ''}`}
          aria-hidden="true"
        >
          {group.imageUrl ? (
            <img src={group.imageUrl} alt="" />
          ) : (
            <span>{group.name.slice(0, 1).toUpperCase()}</span>
          )}
          <i />
          <i />
          <i />
        </div>
        <div className="group-detail-header-top">
          <div className="group-detail-header-info">
            <span className="groups-page-eyebrow">
              {group.eventId ? 'Groupe événement' : 'Communauté permanente'}
            </span>
            <strong className="group-detail-name">
              {group.name}
              {group.verificationStatus === 'verified' && <VerifiedBadge />}
            </strong>
            <div className="group-detail-status-row">
              <span className="group-detail-visibility-badge">
                {group.visibility === 'restricted'
                  ? '◇ Sur demande'
                  : '◎ Accès libre'}
              </span>
              {group.isModerator && (
                <span className="group-detail-role-badge">Administrateur</span>
              )}
            </div>
            {group.eventId && group.eventTitle && (
              <span className="group-detail-event-badge">
                Groupe lié à{' '}
                <button
                  type="button"
                  className="group-detail-event-link"
                  onClick={() =>
                    group.eventId &&
                    onOpenEventForum &&
                    onOpenEventForum(group.eventId)
                  }
                  disabled={!onOpenEventForum}
                >
                  {group.eventTitle}
                  {group.eventStartsAt &&
                    ` — ${new Date(group.eventStartsAt).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })}`}
                  {group.meetupVenue && ` · ${group.meetupVenue.name}`}
                </button>
              </span>
            )}
          </div>
          {group.isMember && (
            <div className="group-detail-header-actions">
              <button
                type="button"
                className={`text-btn ${group.pinned ? 'active' : ''}`}
                onClick={togglePin}
                disabled={pinning}
                title={
                  group.pinned
                    ? 'Retirer des raccourcis'
                    : 'Épingler dans les raccourcis'
                }
              >
                {group.pinned ? '📌 Épinglé' : '📌 Épingler'}
              </button>
              <button
                type="button"
                className="text-btn"
                onClick={leaveGroupAction}
              >
                Quitter
              </button>
            </div>
          )}
        </div>
        {group.description && (
          <p className="group-detail-description">{group.description}</p>
        )}
        <div className="group-detail-members-row">
          {members.length > 0 && (
            <div className="forum-members-avatars">
              {members.slice(0, 8).map((member) => (
                <span
                  className="friends-row-avatar"
                  key={member.id}
                  title={member.displayName}
                >
                  {member.avatarUrl ? (
                    <img src={member.avatarUrl} alt="" />
                  ) : (
                    member.displayName.slice(0, 1).toUpperCase()
                  )}
                </span>
              ))}
            </div>
          )}
          <span className="forum-members-count">
            {group.memberCount} membre{group.memberCount !== 1 ? 's' : ''}
          </span>
          {group.isMember && (
            <button
              type="button"
              className="text-btn"
              onClick={() => setInviteOpen(true)}
            >
              Inviter des amis
            </button>
          )}
        </div>
      </div>

      {!group.isMember && group.myStatus !== 'pending' && (
        <div className="group-detail-join-banner">
          <p>
            {group.visibility === 'restricted'
              ? 'Ce groupe est à accès limité - ta demande sera envoyée au modérateur.'
              : 'Rejoins ce groupe pour discuter, voter, et voir le programme.'}
          </p>
          <button
            type="button"
            className="btn-secondary"
            onClick={joinGroupAction}
            disabled={joining}
          >
            {joining
              ? 'Un instant…'
              : group.visibility === 'restricted'
                ? 'Demander à rejoindre'
                : 'Rejoindre'}
          </button>
        </div>
      )}
      {group.myStatus === 'pending' && (
        <div className="group-detail-join-banner">
          <p>Demande envoyée, en attente d'approbation du modérateur.</p>
        </div>
      )}

      {group.isMember && (
        <>
          <nav className="group-detail-tabs" aria-label="Espaces du groupe">
            <button
              type="button"
              className={tab === 'organize' ? 'active' : ''}
              onClick={() => setTab('organize')}
            >
              <span aria-hidden="true">▦</span>
              Organiser
            </button>
            <button
              type="button"
              className={tab === 'discussion' ? 'active' : ''}
              onClick={() => setTab('discussion')}
            >
              <span aria-hidden="true">◌</span>
              Discussion
              {posts.length > 0 && <small>{posts.length}</small>}
            </button>
            <button
              type="button"
              className={tab === 'members' ? 'active' : ''}
              onClick={() => setTab('members')}
            >
              <span aria-hidden="true">◎</span>
              Membres
              <small>{group.memberCount}</small>
            </button>
            {group.isModerator && (
              <button
                type="button"
                className={tab === 'manage' ? 'active' : ''}
                onClick={() => setTab('manage')}
              >
                <span aria-hidden="true">◇</span>
                Gestion
                {(group.pendingRequestCount ?? 0) > 0 && (
                  <small className="attention">
                    {group.pendingRequestCount}
                  </small>
                )}
              </button>
            )}
          </nav>

          {tab === 'organize' && (
            <section className="group-organize-view">
              <div className="group-view-heading">
                <div>
                  <span className="groups-page-eyebrow">
                    Tableau d’organisation
                  </span>
                  <h2>Préparez la prochaine sortie ensemble.</h2>
                </div>
                <p>Chaque action ici est partagée avec tous les membres.</p>
              </div>
              <div className="group-modules-grid">
                {group.meetupVenue && (
                  <GroupMeetupCard venue={group.meetupVenue} />
                )}
                <GroupScheduleCard groupId={group.id} authToken={authToken} />
                <GroupAttendanceCard groupId={group.id} authToken={authToken} />
                <GroupChecklistCard groupId={group.id} authToken={authToken} />
              </div>
            </section>
          )}

          {tab === 'discussion' && (
            <section className="group-detail-discussion">
              <div className="group-view-heading">
                <div>
                  <span className="groups-page-eyebrow">Fil du groupe</span>
                  <h2>Décidez, échangez, avancez.</h2>
                </div>
                <p>
                  {posts.length} message{posts.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="group-channel-bar">
                <div className="group-channel-list" role="tablist">
                  {channels.map((channel) => (
                    <button
                      key={channel.id}
                      type="button"
                      role="tab"
                      aria-selected={channel.id === activeChannelId}
                      className={`group-channel-tab ${
                        channel.id === activeChannelId ? 'active' : ''
                      } ${channel.staffOnly ? 'staff' : ''}`}
                      onClick={() => setActiveChannelId(channel.id)}
                    >
                      <span aria-hidden="true">
                        {channel.staffOnly ? '◈' : '#'}
                      </span>
                      {channel.name}
                      {channel.postCount > 0 && (
                        <small>{channel.postCount}</small>
                      )}
                    </button>
                  ))}
                </div>
                {group.isModerator && (
                  <form
                    className="group-channel-add"
                    onSubmit={(event) => {
                      event.preventDefault();
                      addChannel();
                    }}
                  >
                    <input
                      value={newChannelName}
                      onChange={(event) =>
                        setNewChannelName(event.target.value)
                      }
                      placeholder="Nouveau fil"
                      maxLength={40}
                      aria-label="Nom du nouveau fil"
                    />
                    <label title="Seul l'administrateur peut y écrire">
                      <input
                        type="checkbox"
                        checked={newChannelStaffOnly}
                        onChange={(event) =>
                          setNewChannelStaffOnly(event.target.checked)
                        }
                      />
                      Annonces
                    </label>
                    <button
                      type="submit"
                      className="text-btn"
                      disabled={addingChannel || !newChannelName.trim()}
                    >
                      Ajouter
                    </button>
                    {activeChannel && channels.length > 1 && (
                      <button
                        type="button"
                        className="text-btn"
                        onClick={() => removeChannel(activeChannel.id)}
                        title={`Supprimer le fil ${activeChannel.name}`}
                      >
                        Supprimer
                      </button>
                    )}
                  </form>
                )}
              </div>
              {!canWriteHere && (
                <p className="group-channel-readonly">
                  Ce fil est réservé aux annonces de l’administrateur. Tu peux
                  le lire et y réagir.
                </p>
              )}
              <form
                className="forum-composer group-main-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitPost();
                }}
                hidden={!canWriteHere}
              >
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Partage une idée, une question ou une décision…"
                  maxLength={2000}
                  rows={3}
                />
                <div className="group-main-composer-footer">
                  <span>{draft.length}/2000</span>
                  <button
                    type="submit"
                    className="btn-secondary"
                    disabled={posting || !draft.trim()}
                  >
                    {posting ? 'Publication…' : 'Publier'}
                  </button>
                </div>
              </form>
              <div className="forum-posts group-posts-feed">
                {postsState === 'loading' && (
                  <p className="list-view-empty">Chargement…</p>
                )}
                {postsState === 'error' && (
                  <p className="list-view-empty">
                    Impossible de charger le fil pour le moment.
                  </p>
                )}
                {postsState === 'success' && topLevelPosts.length === 0 && (
                  <div className="group-empty-feed">
                    <span aria-hidden="true">◌</span>
                    <strong>Lance la première conversation.</strong>
                    <p>
                      Une question simple suffit souvent à organiser toute une
                      sortie.
                    </p>
                  </div>
                )}
                {postsState === 'success' &&
                  topLevelPosts.map((post) => (
                    <GroupPostRow
                      key={post.id}
                      post={post}
                      userId={userId}
                      authToken={authToken}
                      onLike={toggleLike}
                      onDelete={removePost}
                      replies={repliesFor(post.id)}
                      expanded={expandedReplies.has(post.id)}
                      onToggleExpanded={() => toggleExpanded(post.id)}
                      replyDraft={replyDrafts[post.id] ?? ''}
                      onReplyDraftChange={(value) =>
                        setReplyDrafts((prev) => ({
                          ...prev,
                          [post.id]: value
                        }))
                      }
                      onSubmitReply={() => submitPost(post.id)}
                      posting={posting}
                    />
                  ))}
              </div>
            </section>
          )}

          {tab === 'members' && (
            <section className="group-members-view">
              <div className="group-view-heading">
                <div>
                  <span className="groups-page-eyebrow">La communauté</span>
                  <h2>
                    {group.memberCount} membre
                    {group.memberCount !== 1 ? 's' : ''}
                  </h2>
                </div>
                <button
                  type="button"
                  className="groups-create-submit"
                  onClick={() => setInviteOpen(true)}
                >
                  Inviter des amis
                </button>
              </div>
              <div className="group-members-grid">
                {members.map((member) => (
                  <div className="group-member-card" key={member.id}>
                    <span className="friends-row-avatar friends-row-avatar-lg">
                      {member.avatarUrl ? (
                        <img src={member.avatarUrl} alt="" />
                      ) : (
                        member.displayName.slice(0, 1).toUpperCase()
                      )}
                    </span>
                    <span>
                      <strong>{member.displayName}</strong>
                      <small>
                        {member.id === group.createdBy
                          ? 'Créateur du groupe'
                          : 'Membre'}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {tab === 'manage' && group.isModerator && (
            <section className="group-management-view">
              <div className="group-view-heading">
                <div>
                  <span className="groups-page-eyebrow">
                    Espace gestionnaire
                  </span>
                  <h2>Gérer les accès au groupe.</h2>
                </div>
                <span className="group-management-role">
                  Créateur · Gestionnaire
                </span>
              </div>
              <div className="group-management-summary">
                <div>
                  <span>Accès</span>
                  <strong>
                    {group.visibility === 'restricted'
                      ? 'Sur approbation'
                      : 'Libre'}
                  </strong>
                </div>
                <div>
                  <span>Membres</span>
                  <strong>{group.memberCount}</strong>
                </div>
                <div>
                  <span>Demandes</span>
                  <strong>{group.pendingRequestCount ?? 0}</strong>
                </div>
              </div>
              {group.visibility === 'restricted' ? (
                <GroupJoinRequestsCard
                  groupId={group.id}
                  authToken={authToken}
                  onResolved={refreshGroup}
                  showEmpty
                />
              ) : (
                <div className="group-detail-card group-management-empty">
                  <span aria-hidden="true">◎</span>
                  <div>
                    <strong>Ce groupe est en accès libre.</strong>
                    <p>
                      Les membres le rejoignent sans passer par une demande.
                    </p>
                  </div>
                </div>
              )}
              <GroupIdentityCard
                group={group}
                authToken={authToken}
                onGroupUpdated={onGroupUpdated}
              />
            </section>
          )}
        </>
      )}

      {inviteOpen && (
        <InviteToGroupModal
          group={group}
          authToken={authToken}
          onClose={() => setInviteOpen(false)}
        />
      )}
    </div>
  );
}

// A small, non-interactive MapLibre instance centered on the linked
// event's real venue - same map tech/style already used everywhere else
// in the app, not a third-party static-image API (no new dependency, no
// cost). Absent entirely for permanent groups (no event to derive a
// meetup point from).
function GroupMeetupCard({ venue }: { venue: GroupMeetupVenue }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    const instance = new maplibregl.Map({
      container: container.current,
      center: [venue.longitude, venue.latitude],
      zoom: 15,
      style: MAP_STYLE_URL,
      interactive: false,
      attributionControl: false
    });
    new maplibregl.Marker({ color: '#c026d3' })
      .setLngLat([venue.longitude, venue.latitude])
      .addTo(instance);
    return () => instance.remove();
  }, [venue.longitude, venue.latitude]);

  return (
    <div className="group-detail-card group-module-card group-meetup-card">
      <div className="group-module-heading">
        <span aria-hidden="true">⌖</span>
        <div>
          <h3>Point de rendez-vous</h3>
          <p>Le lieu réel lié à l’événement.</p>
        </div>
      </div>
      <div className="group-meetup-map" ref={container} />
      <div className="group-meetup-address">
        <strong>{venue.name}</strong>
        <span>{venue.address}</span>
      </div>
    </div>
  );
}

// "Programme" - real items added by members, sorted by time. No item is
// ever guessed or auto-filled.
function GroupScheduleCard({
  groupId,
  authToken
}: {
  groupId: string;
  authToken: string | undefined;
}) {
  const [items, setItems] = useState<GroupScheduleItem[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [label, setLabel] = useState('');
  const [time, setTime] = useState('');
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(() => {
    if (!authToken) return;
    setState('loading');
    fetch(`${API_BASE_URL}/groups/${groupId}/schedule`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setItems(groupScheduleItemsResponseSchema.parse(json).data);
        setState('success');
      })
      .catch(() => setState('error'));
  }, [authToken, groupId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addItem = () => {
    if (!authToken || !label.trim() || !time || adding) return;
    setAdding(true);
    fetch(`${API_BASE_URL}/groups/${groupId}/schedule`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        label: label.trim(),
        scheduledAt: new Date(time).toISOString()
      })
    })
      .then((response) => (response.ok ? undefined : Promise.reject()))
      .then(() => {
        setLabel('');
        setTime('');
        refresh();
      })
      .catch(() => {})
      .finally(() => setAdding(false));
  };

  return (
    <div className="group-detail-card group-module-card group-schedule-card">
      <div className="group-module-heading">
        <span aria-hidden="true">◷</span>
        <div>
          <h3>Programme</h3>
          <p>Construisez le déroulé de la sortie.</p>
        </div>
      </div>
      {state === 'loading' && <p className="list-view-empty">Chargement…</p>}
      {state === 'success' && items.length === 0 && (
        <p className="list-view-empty">Aucun horaire pour l'instant.</p>
      )}
      {state === 'success' && items.length > 0 && (
        <ul className="group-schedule-list">
          {items.map((item) => (
            <li key={item.id}>
              <span className="group-schedule-time">
                {new Date(item.scheduledAt).toLocaleTimeString('fr-CA', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      )}
      <form
        className="group-schedule-form"
        onSubmit={(event) => {
          event.preventDefault();
          addItem();
        }}
      >
        <input
          type="datetime-local"
          value={time}
          onChange={(event) => setTime(event.target.value)}
        />
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Ex: Rendez-vous au bar"
          maxLength={120}
        />
        <button
          type="submit"
          className="text-btn"
          disabled={adding || !label.trim() || !time}
        >
          + Ajouter
        </button>
      </form>
    </div>
  );
}

// "Qui vient ?" - real votes from real members, percentages computed from
// the real total of votes cast (never simulated, never assumed).
function GroupAttendanceCard({
  groupId,
  authToken
}: {
  groupId: string;
  authToken: string | undefined;
}) {
  const [summary, setSummary] = useState<GroupAttendanceSummary>();
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );

  const refresh = useCallback(() => {
    if (!authToken) return;
    setState('loading');
    fetch(`${API_BASE_URL}/groups/${groupId}/attendance`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setSummary(groupAttendanceSummarySchema.parse(json));
        setState('success');
      })
      .catch(() => setState('error'));
  }, [authToken, groupId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const vote = (response: AttendanceResponse) => {
    if (!authToken) return;
    fetch(`${API_BASE_URL}/groups/${groupId}/attendance`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ response })
    }).then(() => refresh());
  };

  const total = summary ? summary.yes + summary.maybe + summary.no : 0;

  return (
    <div className="group-detail-card group-module-card group-attendance-card">
      <div className="group-module-heading">
        <span aria-hidden="true">◎</span>
        <div>
          <h3>Qui vient ?</h3>
          <p>Une réponse claire par membre.</p>
        </div>
      </div>
      {state === 'loading' && <p className="list-view-empty">Chargement…</p>}
      {state === 'success' && summary && (
        <>
          <div className="group-attendance-bars">
            {(['yes', 'maybe', 'no'] as const).map((key) => {
              const count = summary[key];
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div className="group-attendance-row" key={key}>
                  <span className="group-attendance-label">
                    {ATTENDANCE_LABELS[key]}
                  </span>
                  <div className="group-attendance-bar-track">
                    <div
                      className={`group-attendance-bar-fill group-attendance-${key}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="group-attendance-count">
                    {count} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
          <p className="group-attendance-total">
            {total} réponse{total !== 1 ? 's' : ''}
          </p>
          <div className="group-attendance-actions">
            {(['yes', 'maybe', 'no'] as const).map((key) => (
              <button
                type="button"
                key={key}
                className={`text-btn ${summary.myResponse === key ? 'active' : ''}`}
                onClick={() => vote(key)}
              >
                {ATTENDANCE_LABELS[key]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// "Checklist" - checkedCount/totalMembers reflects real, individual
// members checking an item off for themselves, never a fabricated
// fraction.
function GroupChecklistCard({
  groupId,
  authToken
}: {
  groupId: string;
  authToken: string | undefined;
}) {
  const [items, setItems] = useState<GroupChecklistItem[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [label, setLabel] = useState('');
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(() => {
    if (!authToken) return;
    setState('loading');
    fetch(`${API_BASE_URL}/groups/${groupId}/checklist`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setItems(groupChecklistItemsResponseSchema.parse(json).data);
        setState('success');
      })
      .catch(() => setState('error'));
  }, [authToken, groupId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addItem = () => {
    if (!authToken || !label.trim() || adding) return;
    setAdding(true);
    fetch(`${API_BASE_URL}/groups/${groupId}/checklist`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ label: label.trim() })
    })
      .then((response) => (response.ok ? undefined : Promise.reject()))
      .then(() => {
        setLabel('');
        refresh();
      })
      .catch(() => {})
      .finally(() => setAdding(false));
  };

  const toggle = (item: GroupChecklistItem) => {
    if (!authToken) return;
    const nextChecked = !item.checkedByMe;
    setItems((prev) =>
      prev.map((candidate) =>
        candidate.id === item.id
          ? {
              ...candidate,
              checkedByMe: nextChecked,
              checkedCount: candidate.checkedCount + (nextChecked ? 1 : -1)
            }
          : candidate
      )
    );
    fetch(`${API_BASE_URL}/groups/${groupId}/checklist/${item.id}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ checked: nextChecked })
    }).catch(() => refresh());
  };

  return (
    <div className="group-detail-card group-module-card group-checklist-card">
      <div className="group-module-heading">
        <span aria-hidden="true">✓</span>
        <div>
          <h3>Checklist</h3>
          <p>Les choses à prévoir avant de partir.</p>
        </div>
      </div>
      {state === 'loading' && <p className="list-view-empty">Chargement…</p>}
      {state === 'success' && items.length === 0 && (
        <p className="list-view-empty">Aucun item pour l'instant.</p>
      )}
      {state === 'success' && items.length > 0 && (
        <ul className="group-checklist-list">
          {items.map((item) => (
            <li key={item.id}>
              <label className="group-checklist-item">
                <input
                  type="checkbox"
                  checked={item.checkedByMe}
                  onChange={() => toggle(item)}
                />
                <span>{item.label}</span>
              </label>
              <span className="group-checklist-fraction">
                {item.checkedCount}/{item.totalMembers}
              </span>
            </li>
          ))}
        </ul>
      )}
      <form
        className="group-checklist-form"
        onSubmit={(event) => {
          event.preventDefault();
          addItem();
        }}
      >
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Ex: Tickets"
          maxLength={120}
        />
        <button
          type="submit"
          className="text-btn"
          disabled={adding || !label.trim()}
        >
          + Ajouter un item
        </button>
      </form>
    </div>
  );
}

// Moderator-only (Phase 4.10, DEC-0013 v1.2) - the only moderation power
// a group's creator has: approving/declining join requests for a
// restricted group. Nothing else.
function GroupJoinRequestsCard({
  groupId,
  authToken,
  onResolved,
  showEmpty = false
}: {
  groupId: string;
  authToken: string | undefined;
  onResolved: () => void;
  showEmpty?: boolean;
}) {
  const [requests, setRequests] = useState<PublicUser[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );

  const refresh = useCallback(() => {
    if (!authToken) return;
    setState('loading');
    fetch(`${API_BASE_URL}/groups/${groupId}/join-requests`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setRequests(groupJoinRequestsResponseSchema.parse(json).data);
        setState('success');
      })
      .catch(() => setState('error'));
  }, [authToken, groupId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const respond = (targetUserId: string, action: 'accept' | 'decline') => {
    if (!authToken) return;
    fetch(`${API_BASE_URL}/groups/${groupId}/join-requests/${targetUserId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ action })
    }).then(() => {
      refresh();
      onResolved();
    });
  };

  if (state === 'success' && requests.length === 0 && !showEmpty) return null;

  return (
    <div className="group-detail-card group-join-requests-card">
      <h3>Demandes en attente</h3>
      {state === 'loading' && <p className="list-view-empty">Chargement…</p>}
      {state === 'success' && requests.length === 0 && (
        <div className="group-management-empty-inline">
          <span aria-hidden="true">✓</span>
          <p>Aucune demande à traiter pour le moment.</p>
        </div>
      )}
      {requests.map((request) => (
        <div className="amis-row" key={request.id}>
          <span className="friends-row-avatar friends-row-avatar-lg">
            {request.avatarUrl ? (
              <img src={request.avatarUrl} alt="" />
            ) : (
              request.displayName.slice(0, 1).toUpperCase()
            )}
          </span>
          <span className="amis-row-name">{request.displayName}</span>
          <div className="amis-row-actions">
            <button
              type="button"
              className="amis-btn-accept"
              onClick={() => respond(request.id, 'accept')}
            >
              Accepter
            </button>
            <button
              type="button"
              className="amis-btn-ghost"
              onClick={() => respond(request.id, 'decline')}
            >
              Refuser
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// "Inviter des amis" - never joins someone on their behalf (membership
// stays a self-service action per DEC-0013); sends a direct message with
// a link, same real mechanism as EventHero's "Envoyer à un ami".
function InviteToGroupModal({
  group,
  authToken,
  onClose
}: {
  group: Group;
  authToken: string | undefined;
  onClose: () => void;
}) {
  const [friendsList, setFriendsList] = useState<PublicUser[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [sendingTo, setSendingTo] = useState<string>();

  useEffect(() => {
    if (!authToken) return;
    setState('loading');
    fetch(`${API_BASE_URL}/me/friends`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setFriendsList(friendsResponseSchema.parse(json).data);
        setState('success');
      })
      .catch(() => setState('error'));
  }, [authToken]);

  const sendInvite = (friendId: string) => {
    if (!authToken || sendingTo) return;
    setSendingTo(friendId);
    const url = `${window.location.origin}/groups/${group.id}`;
    fetch(`${API_BASE_URL}/me/friends/${friendId}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        body: `Rejoins le groupe « ${group.name} » sur Pulso !\n${url}`
      })
    })
      .then((response) => (response.ok ? undefined : Promise.reject()))
      .then(() => setSentTo((prev) => new Set(prev).add(friendId)))
      .catch(() => {})
      .finally(() => setSendingTo(undefined));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="share-friend-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="conversation-modal-header">
          <strong>Inviter des amis</strong>
          <button type="button" className="text-btn" onClick={onClose}>
            Fermer
          </button>
        </div>
        <div className="share-friend-list">
          {state === 'loading' && (
            <p className="list-view-empty">Chargement…</p>
          )}
          {state === 'error' && (
            <p className="list-view-empty">
              Impossible de charger vos amis pour le moment.
            </p>
          )}
          {state === 'success' && friendsList.length === 0 && (
            <p className="list-view-empty">
              Ajoute des amis pour pouvoir les inviter.
            </p>
          )}
          {state === 'success' &&
            friendsList.map((friend) => (
              <div className="friends-row" key={friend.id}>
                <span className="friends-row-avatar">
                  {friend.avatarUrl ? (
                    <img src={friend.avatarUrl} alt="" />
                  ) : (
                    friend.displayName.slice(0, 1).toUpperCase()
                  )}
                </span>
                <span className="friends-row-name">{friend.displayName}</span>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => sendInvite(friend.id)}
                  disabled={sendingTo === friend.id || sentTo.has(friend.id)}
                >
                  {sentTo.has(friend.id)
                    ? 'Envoyé ✓'
                    : sendingTo === friend.id
                      ? 'Envoi…'
                      : 'Inviter'}
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

export function GroupModal({
  group,
  authToken,
  userId,
  onClose,
  onLeft
}: {
  group: Group;
  authToken: string | undefined;
  userId: string;
  onClose: () => void;
  onLeft: () => void;
}) {
  const [current, setCurrent] = useState(group);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="group-modal" onClick={(event) => event.stopPropagation()}>
        <div className="group-modal-close-row">
          <button type="button" className="text-btn" onClick={onClose}>
            Fermer
          </button>
        </div>
        <GroupDetailContent
          group={current}
          authToken={authToken}
          userId={userId}
          onGroupUpdated={setCurrent}
          onLeave={onLeft}
        />
      </div>
    </div>
  );
}

function GroupPostRow({
  post,
  userId,
  authToken,
  onLike,
  onDelete,
  replies,
  expanded,
  onToggleExpanded,
  replyDraft,
  onReplyDraftChange,
  onSubmitReply,
  posting
}: {
  post: GroupPost;
  userId: string;
  authToken: string | undefined;
  onLike: (post: GroupPost) => void;
  onDelete: (postId: string) => void;
  replies: GroupPost[];
  expanded: boolean;
  onToggleExpanded: () => void;
  replyDraft: string;
  onReplyDraftChange: (value: string) => void;
  onSubmitReply: () => void;
  posting: boolean;
}) {
  // Groups are a small, personal space between people who already know
  // each other (unlike the public, categorized Forum) - real chat bubbles
  // with a clear "mine vs. theirs" color/side distinction read as personal
  // in a way the Forum's public post-card feed deliberately doesn't.
  const renderBubble = (item: GroupPost, isReply: boolean) => {
    const mine = item.author.id === userId;
    return (
      <div
        key={item.id}
        className={`group-bubble-row ${mine ? 'mine' : 'theirs'}`}
      >
        {!mine && (
          <span className="friends-row-avatar group-bubble-avatar">
            {item.author.avatarUrl ? (
              <img src={item.author.avatarUrl} alt="" />
            ) : (
              item.author.displayName.slice(0, 1).toUpperCase()
            )}
          </span>
        )}
        <div className="group-bubble-col">
          <span className="group-bubble-author">
            {mine ? 'Vous' : item.author.displayName}
            <time dateTime={item.createdAt}>
              {formatRelativeTime(item.createdAt)}
            </time>
          </span>
          <div className="group-bubble">
            <p>{item.body}</p>
          </div>
          <div className="group-bubble-actions">
            <button
              type="button"
              className={`forum-like-btn ${item.likedByMe ? 'active' : ''}`}
              onClick={() => onLike(item)}
            >
              <HeartIcon filled={item.likedByMe} />
              <span>{item.likedByMe ? 'Aimé' : 'J’aime'}</span>
              {item.likeCount > 0 && <b>{item.likeCount}</b>}
            </button>
            {!isReply && (
              <button
                type="button"
                className="text-btn"
                onClick={onToggleExpanded}
              >
                {item.replyCount === 0
                  ? 'Répondre'
                  : `${item.replyCount} réponse${item.replyCount !== 1 ? 's' : ''}`}
              </button>
            )}
            {mine ? (
              <button
                type="button"
                className="text-btn"
                onClick={() => onDelete(item.id)}
              >
                Supprimer
              </button>
            ) : (
              <button
                type="button"
                className="text-btn"
                onClick={() => reportContent(authToken, 'group_post', item.id)}
              >
                Signaler
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {renderBubble(post, false)}
      {expanded && (
        <div className="group-bubble-replies">
          {replies.map((reply) => renderBubble(reply, true))}
          <form
            className="forum-composer forum-reply-composer"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmitReply();
            }}
          >
            <textarea
              value={replyDraft}
              onChange={(event) => onReplyDraftChange(event.target.value)}
              placeholder="Répondre…"
              maxLength={2000}
              rows={1}
            />
            <button
              type="submit"
              className="btn-secondary"
              disabled={posting || !replyDraft.trim()}
            >
              Répondre
            </button>
          </form>
        </div>
      )}
    </>
  );
}
