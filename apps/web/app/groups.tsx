'use client';

import {
  discoverGroupsResponseSchema,
  groupChannelsResponseSchema,
  groupSponsoredPlacementsResponseSchema,
  friendsResponseSchema,
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
  GroupSponsoredPlacement,
  DiscoverGroupEntry,
  Group,
  GroupChecklistItem,
  GroupMeetupVenue,
  GroupPost,
  GroupScheduleItem,
  GroupVisibility,
  PublicUser
} from '@pulso/contracts';
import { translate } from '@pulso/domain/localization';
import type {
  MessageKey,
  SupportedLocale
} from '@pulso/domain/localization';
import type {
  GroupModule,
  GroupModuleConfig,
  GroupTypeValue
} from '@pulso/domain';
import maplibregl from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  API_BASE_URL,
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
  locale,
  onOpenEventForum
}: {
  authToken: string | undefined;
  userId: string;
  locale: SupportedLocale;
  onOpenEventForum: (eventId: string) => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [selectedGroup, setSelectedGroup] = useState<Group>();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<GroupVisibility>('open');
  const [type, setType] = useState<GroupTypeValue>('community');
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
        type,
        visibility,
        ...(description.trim() ? { description: description.trim() } : {})
      })
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setName('');
        setDescription('');
        setVisibility('open');
        setType('community');
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
            {t('groups.back')}
          </button>
        </div>
        <div className="groups-open-workspace">
          <GroupDetailContent
            group={selectedGroup}
            authToken={authToken}
            userId={userId}
            locale={locale}
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
            <span className="groups-page-eyebrow">{t('groups.eyebrow')}</span>
            <h1>{t('groups.title')}</h1>
            <p>{t('groups.tagline')}</p>
          </div>
          <button
            type="button"
            className={`groups-create-trigger ${createOpen ? 'active' : ''}`}
            onClick={() => setCreateOpen((open) => !open)}
            aria-expanded={createOpen}
          >
            <span aria-hidden="true">+</span>
            {t('groups.create')}
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
                <span className="groups-page-eyebrow">
                  {t('groups.createEyebrow')}
                </span>
                <strong>{t('groups.createHeading')}</strong>
              </div>
              <button
                type="button"
                className="text-btn"
                onClick={() => setCreateOpen(false)}
              >
                {t('groups.close')}
              </button>
            </div>
            <label className="groups-create-field">
              <span>{t('groups.nameLabel')}</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('groups.namePlaceholder')}
                maxLength={80}
                autoFocus
              />
            </label>
            <label className="groups-create-field">
              <span>{t('groups.missionLabel')}</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t('groups.missionPlaceholder')}
                maxLength={500}
                rows={3}
              />
              <small>{description.length}/500</small>
            </label>
            <fieldset className="groups-visibility-choice groups-type-choice">
              <legend>{t('groups.typeLegend')}</legend>
              {(
                [
                  {
                    value: 'community',
                    icon: '◇',
                    title: t('groups.typeCommunity'),
                    hint: t('groups.typeCommunityHint')
                  },
                  {
                    value: 'event',
                    icon: '◈',
                    title: t('groups.typeEvent'),
                    hint: t('groups.typeEventHint')
                  },
                  {
                    value: 'private_crew',
                    icon: '◆',
                    title: t('groups.typeCrew'),
                    hint: t('groups.typeCrewHint')
                  }
                ] as const
              ).map((option) => (
                <label
                  key={option.value}
                  className={type === option.value ? 'active' : ''}
                >
                  <input
                    type="radio"
                    name="group-type"
                    checked={type === option.value}
                    onChange={() => {
                      setType(option.value);
                      // A private crew is invite-only by definition, so the
                      // two choices are not independent: picking it sets the
                      // visibility it implies rather than letting the form
                      // offer a combination the server would not honour.
                      if (option.value === 'private_crew') {
                        setVisibility('private_invite');
                      } else if (visibility === 'private_invite') {
                        setVisibility('open');
                      }
                    }}
                  />
                  <span className="groups-visibility-icon" aria-hidden="true">
                    {option.icon}
                  </span>
                  <span>
                    <strong>{option.title}</strong>
                    <small>{option.hint}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <fieldset
              className="groups-visibility-choice"
              disabled={type === 'private_crew'}
            >
              <legend>{t('groups.joinLegend')}</legend>
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
                  <strong>{t('groups.joinOpen')}</strong>
                  <small>{t('groups.joinOpenHint')}</small>
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
                  <strong>{t('groups.joinRestricted')}</strong>
                  <small>{t('groups.joinRestrictedHint')}</small>
                </span>
              </label>
              {type === 'private_crew' && (
                <p className="groups-type-note">
                  {t('groups.crewNote')}
                </p>
              )}
            </fieldset>
            <button
              type="submit"
              className="groups-create-submit"
              disabled={creating || !name.trim()}
            >
              {creating ? t('groups.creating') : t('groups.createSubmit')}
            </button>
          </form>
        )}
        <MessagesGroupsTab
          key={listVersion}
          authToken={authToken}
          locale={locale}
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
              <span className="groups-page-eyebrow">
                {t('groups.emptyEyebrow')}
              </span>
              <h2>{t('groups.emptyHeading')}</h2>
              <p>
                {t('groups.emptyBody')}
              </p>
              <button
                type="button"
                className="groups-create-submit"
                onClick={() => setCreateOpen(true)}
              >
                {t('groups.emptyCta')}
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
  locale,
  onSelectGroup
}: {
  authToken: string | undefined;
  selectedGroupId: string | undefined;
  locale: SupportedLocale;
  onSelectGroup: (group: Group) => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
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
          {t('groups.tabMine')}
        </button>
        <button
          type="button"
          className={subTab === 'event' ? 'active' : ''}
          onClick={() => setSubTab('event')}
        >
          {t('groups.tabEvents')}
        </button>
        <button
          type="button"
          className={subTab === 'discover' ? 'active' : ''}
          onClick={() => setSubTab('discover')}
        >
          {t('groups.tabDiscover')}
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
          aria-label={t('groups.searchLabel')}
        />
      </label>

      {state === 'loading' && <p className="list-view-empty">Chargement…</p>}
      {state === 'error' && (
        <p className="list-view-empty">
          {t('groups.loadError')}
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
          {t('groups.noMatch')}
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
                    <VerifiedBadge compact locale={locale} />
                  )}
                </strong>
                {group.isModerator && (
                  <span className="group-directory-admin">
                    {t('groups.roleAdmin')}
                  </span>
                )}
                <span className="group-directory-access">
                  {group.visibility === 'restricted'
                    ? t('groups.accessRestricted')
                    : t('groups.accessOpen')}
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
                <span>
                  {event ? t('groups.kindEvent') : t('groups.kindCommunity')}
                </span>
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
  userId,
  locale
}: {
  authToken: string | undefined;
  userId: string;
  locale: SupportedLocale;
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
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

  return (
    <div className="compte-block">
      {/*
        Creation lives on the Groupes page, the only form that asks for the
        group's type. This block used to carry a second, simpler copy that
        always produced a 'community' group whatever the creator meant.
      */}
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
          locale={locale}
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
type GroupDetailTab = 'feed' | 'members' | 'manage';


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
function VerifiedBadge({
  compact,
  locale
}: {
  compact?: boolean;
  locale: SupportedLocale;
}) {
  return (
    <span
      className={`group-verified-badge ${compact ? 'compact' : ''}`}
      title={translate(locale, 'groups.verifiedTitle')}
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
      {!compact && <span>{translate(locale, 'groups.verified')}</span>}
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
  locale,
  onGroupUpdated
}: {
  group: Group;
  authToken: string | undefined;
  locale: SupportedLocale;
  onGroupUpdated: (group: Group) => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
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
            ? t('groups.identityPhotoFormatError')
            : response?.status === 413
              ? t('groups.identityPhotoTooLarge')
              : t('groups.identityPhotoSaveError')
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
      .catch(() => setError(t('groups.identityPhotoRemoveError')))
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
      .catch(() => setError(t('groups.verificationSendError')))
      .finally(() => setBusy(false));
  };

  return (
    <div className="group-detail-card group-identity-card">
      <div className="group-identity-photo">
        <GroupAvatar group={group} className="group-avatar-xl" />
        <div className="group-identity-photo-actions">
          <strong>{t('groups.identityPhotoTitle')}</strong>
          <p>{t('groups.identityPhotoHint')}</p>
          <div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
            >
              {group.imageUrl
                ? t('groups.identityPhotoReplace')
                : t('groups.identityPhotoAdd')}
            </button>
            {group.imageUrl && (
              <button
                type="button"
                className="text-btn"
                onClick={removePhoto}
                disabled={busy}
              >
                {t('groups.identityPhotoRemove')}
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
          <strong>{t('groups.verificationHeading')}</strong>
          {group.verificationStatus === 'verified' && (
            <VerifiedBadge locale={locale} />
          )}
        </div>
        {group.verificationStatus === 'verified' && (
          <p>{t('groups.verificationVerified')}</p>
        )}
        {group.verificationStatus === 'pending' && (
          <p>{t('groups.verificationPending')}</p>
        )}
        {group.verificationStatus === 'declined' && (
          <p>{t('groups.verificationDeclined')}</p>
        )}
        {group.verificationStatus !== 'verified' &&
          group.verificationStatus !== 'pending' &&
          !askOpen && (
            <>
              <p>{t('groups.verificationPrompt')}</p>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setAskOpen(true)}
              >
                {t('groups.verificationAsk')}
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
              <span>{t('groups.verificationLabel')}</span>
              <textarea
                value={justification}
                onChange={(changeEvent) =>
                  setJustification(changeEvent.target.value)
                }
                maxLength={500}
                rows={3}
                placeholder={t('groups.verificationPlaceholder')}
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
                {t('groups.verificationCancel')}
              </button>
              <button
                type="submit"
                className="groups-create-submit"
                disabled={busy || !justification.trim()}
              >
                {busy
                  ? t('groups.verificationSending')
                  : t('groups.verificationSubmit')}
              </button>
            </div>
          </form>
        )}
        {error && <p className="group-identity-error">{error}</p>}
      </div>
    </div>
  );
}


/**
 * The moderator's control over what the workspace actually shows.
 *
 * Disabling a module hides it and never destroys its data (DEC-0015), so
 * the copy says exactly that - turning "Qui vient ?" off does not discard
 * anyone's vote. Order here is the order of the cards in "Organiser".
 */
/**
 * What each module is called, and what it does, as catalogue keys. The
 * strings themselves live in both catalogues; this map is only the
 * module-to-key wiring.
 */
const MODULE_LABEL_KEYS: Record<
  GroupModule,
  { name: MessageKey; description: MessageKey }
> = {
  programme: {
    name: 'groups.moduleProgrammeName',
    description: 'groups.moduleProgrammeDescription'
  },
  attendance: {
    name: 'groups.moduleAttendanceName',
    description: 'groups.moduleAttendanceDescription'
  },
  meetup_point: {
    name: 'groups.moduleMeetupPointName',
    description: 'groups.moduleMeetupPointDescription'
  },
  checklist: {
    name: 'groups.moduleChecklistName',
    description: 'groups.moduleChecklistDescription'
  }
};

function GroupModulesCard({
  group,
  authToken,
  locale,
  onGroupUpdated
}: {
  group: Group;
  authToken: string | undefined;
  locale: SupportedLocale;
  onGroupUpdated: (group: Group) => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const save = (modulesConfig: GroupModuleConfig[]) => {
    if (!authToken || busy) return;
    setBusy(true);
    setError(undefined);
    fetch(`${API_BASE_URL}/groups/${group.id}/modules`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ modulesConfig })
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => onGroupUpdated(groupResponseSchema.parse(json).data))
      .catch(() => setError(t('groups.modulesSaveError')))
      .finally(() => setBusy(false));
  };

  const renumber = (entries: GroupModuleConfig[]) =>
    entries.map((entry, position) => ({ ...entry, position }));

  const toggle = (module: string) =>
    save(
      renumber(
        group.modulesConfig.map((entry) =>
          entry.module === module
            ? { ...entry, enabled: !entry.enabled }
            : entry
        )
      )
    );

  const move = (index: number, delta: number) => {
    const next = [...group.modulesConfig];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    save(renumber(next));
  };

  return (
    <div className="group-detail-card group-modules-card">
      <div className="group-modules-card-head">
        <strong>{t('groups.modulesHeading')}</strong>
        <p>{t('groups.modulesHint')}</p>
      </div>
      <ul className="group-modules-config">
        {group.modulesConfig.map((entry, index) => {
          const label = MODULE_LABEL_KEYS[entry.module];
          const name = t(label.name);
          const unavailable =
            entry.module === 'meetup_point' && !group.meetupVenue;
          return (
            <li
              key={entry.module}
              className={entry.enabled ? 'enabled' : undefined}
            >
              <span className="group-modules-config-order">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={busy || index === 0}
                  aria-label={translate(locale, 'groups.modulesMoveUp', {
                    name
                  })}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={busy || index === group.modulesConfig.length - 1}
                  aria-label={translate(locale, 'groups.modulesMoveDown', {
                    name
                  })}
                >
                  ↓
                </button>
              </span>
              <span className="group-modules-config-text">
                <strong>{name}</strong>
                <small>{t(label.description)}</small>
                {unavailable && entry.enabled && (
                  <em>{t('groups.modulesUnavailable')}</em>
                )}
              </span>
              <label className="group-modules-config-switch">
                <input
                  type="checkbox"
                  checked={entry.enabled}
                  disabled={busy}
                  onChange={() => toggle(entry.module)}
                />
                <span>
                  {entry.enabled
                    ? t('groups.modulesEnabled')
                    : t('groups.modulesHidden')}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {error && <p className="group-identity-error">{error}</p>}
    </div>
  );
}


/**
 * A paid placement at the top of "Organiser" (DEC-0015 §Future
 * monetization).
 *
 * Three rules the decision is explicit about, and which the markup keeps:
 * it is labelled as sponsored in plain words, never dressed as a staff
 * recommendation; it names who paid for it; and the group's own
 * administrator can take it down, which is what makes the community's
 * consent real rather than nominal.
 */
function GroupSponsoredBanner({
  placement,
  canDismiss,
  canOrganise,
  locale,
  onOpenEvent,
  onDismiss,
  onOrganise
}: {
  placement: GroupSponsoredPlacement;
  canDismiss: boolean;
  canOrganise: boolean;
  locale: SupportedLocale;
  onOpenEvent: ((eventId: string) => void) | undefined;
  onDismiss: () => void;
  onOrganise: () => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const { event } = placement;
  const startsAt = new Date(event.startsAt);
  return (
    <article
      className={`group-sponsored-banner ${event.imageUrl ? 'has-photo' : ''}`}
    >
      {event.imageUrl && (
        <img className="group-sponsored-photo" src={event.imageUrl} alt="" />
      )}
      <div className="group-sponsored-body">
        <div className="group-sponsored-top">
          {/* DEC-0015: always labelled, never presented as a staff pick. */}
          <span className="group-sponsored-tag">
            {translate(locale, 'groups.sponsoredTag', {
              sponsor: placement.sponsorName
            })}
          </span>
          {canDismiss && (
            <button
              type="button"
              className="group-sponsored-dismiss"
              onClick={onDismiss}
              title={t('groups.sponsoredDismissTitle')}
            >
              {t('groups.sponsoredDismiss')}
            </button>
          )}
        </div>
        <strong className="group-sponsored-title">{event.title}</strong>
        <span className="group-sponsored-meta">
          {startsAt.toLocaleDateString('fr-CA', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
          })}
          {' · '}
          {startsAt.toLocaleTimeString('fr-CA', {
            hour: '2-digit',
            minute: '2-digit'
          })}
          {event.venueName ? ` · ${event.venueName}` : ''}
        </span>
        {placement.message && (
          <p className="group-sponsored-message">{placement.message}</p>
        )}
        <div className="group-sponsored-actions">
          <button
            type="button"
            className="group-sponsored-cta"
            onClick={() => onOpenEvent && onOpenEvent(event.id)}
            disabled={!onOpenEvent}
          >
            {t('groups.sponsoredCta')}
          </button>
          {canOrganise && (
            // The bridge: a banner becomes the group's current outing, and
            // the programme, attendance and checklist start describing it.
            <button
              type="button"
              className="group-sponsored-secondary"
              onClick={onOrganise}
            >
              {t('groups.sponsoredOrganise')}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}


/**
 * An outing as it appears in the feed: what it is, where, when, and the
 * three answers taken on the spot.
 *
 * Attendance is inline rather than in a module of its own because that is
 * the whole point of the redesign - an outing nobody can answer without
 * leaving the stream is an outing nobody answers.
 */
function GroupOutingCard({
  groupId,
  outing,
  authToken,
  modules,
  locale,
  onAnswered
}: {
  groupId: string;
  outing: NonNullable<GroupPost['outing']>;
  authToken: string | undefined;
  locale: SupportedLocale;
  /** Which modules the group turned on, from its registry. */
  modules: Set<string>;
  onAnswered: () => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const answer = (response: AttendanceResponse) => {
    if (!authToken || busy) return;
    setBusy(true);
    fetch(`${API_BASE_URL}/groups/${groupId}/outings/${outing.id}/attendance`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ response })
    })
      .then((httpResponse) => {
        if (httpResponse.ok) onAnswered();
      })
      .catch(() => {})
      .finally(() => setBusy(false));
  };

  const when = outing.startsAt ? new Date(outing.startsAt) : undefined;
  const counts: Record<AttendanceResponse, number> = {
    yes: outing.yes,
    maybe: outing.maybe,
    no: outing.no
  };

  return (
    <div className="group-outing-card">
      <div className="group-outing-card-head">
        <span className="group-outing-chip">{t('groups.outingChip')}</span>
        <strong>{outing.title}</strong>
        <span className="group-outing-when">
          {when
            ? `${when.toLocaleDateString('fr-CA', {
                weekday: 'long',
                day: 'numeric',
                month: 'long'
              })} · ${when.toLocaleTimeString('fr-CA', {
                hour: '2-digit',
                minute: '2-digit'
              })}`
            : t('groups.outingNoDate')}
          {outing.place ? ` · ${outing.place}` : ''}
        </span>
      </div>

      <div className="group-outing-answers">
        {(
          [
            ['yes', t('groups.outingGoing')],
            ['maybe', t('groups.outingMaybe')],
            ['no', t('groups.outingNo')]
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={outing.myResponse === value ? 'active' : ''}
            onClick={() => answer(value)}
            disabled={busy}
          >
            {label}
            <small>{counts[value]}</small>
          </button>
        ))}
      </div>

      {(modules.has('programme') || modules.has('checklist')) && (
        <button
          type="button"
          className="group-outing-toggle"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
        >
          {open ? '▾' : '▸'} {t('groups.outingModules')}
        </button>
      )}
      {open && (
        <div className="group-outing-modules">
          {modules.has('programme') && (
            <GroupScheduleCard
              groupId={groupId}
              authToken={authToken}
              locale={locale}
              outingId={outing.id}
            />
          )}
          {modules.has('checklist') && (
            <GroupChecklistCard
              groupId={groupId}
              authToken={authToken}
              locale={locale}
              outingId={outing.id}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function GroupDetailContent({
  group,
  authToken,
  userId,
  locale,
  onGroupUpdated,
  onLeave,
  onOpenEventForum
}: {
  group: Group;
  authToken: string | undefined;
  userId: string;
  locale: SupportedLocale;
  onGroupUpdated: (group: Group) => void;
  onLeave?: () => void;
  onOpenEventForum?: (eventId: string) => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [posts, setPosts] = useState<GroupPost[]>([]);
  const [postsState, setPostsState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [draft, setDraft] = useState('');
  const [outingDraft, setOutingDraft] = useState({
    title: '',
    place: '',
    startsAt: ''
  });
  const [outingComposerOpen, setOutingComposerOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(
    new Set()
  );
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [members, setMembers] = useState<PublicUser[]>([]);
  const [channels, setChannels] = useState<GroupChannel[]>([]);
  const [placements, setPlacements] = useState<GroupSponsoredPlacement[]>([]);
  const [startingOuting, setStartingOuting] = useState(false);
  const [activeChannelId, setActiveChannelId] = useState<string>();
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelStaffOnly, setNewChannelStaffOnly] = useState(false);
  const [addingChannel, setAddingChannel] = useState(false);
  const [joining, setJoining] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [tab, setTab] = useState<GroupDetailTab>('feed');

  useEffect(() => {
    setTab('feed');
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

  const refreshPlacements = useCallback(() => {
    if (!authToken || !group.isMember) return;
    fetch(`${API_BASE_URL}/groups/${group.id}/placements`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) =>
        setPlacements(groupSponsoredPlacementsResponseSchema.parse(json).data)
      )
      .catch(() => {});
  }, [authToken, group.id, group.isMember]);

  useEffect(() => {
    refreshPlacements();
  }, [refreshPlacements]);

  /**
   * Starting an outing archives the current one, so the programme,
   * attendance and checklist come back empty while the previous plan stays
   * readable. `event` is set when the group acts on a placement - that is
   * the bridge between a banner and something actually organised.
   */
  const startOuting = (input: {
    title: string;
    eventId?: string;
    startsAt?: string;
  }) => {
    if (!authToken || startingOuting || !input.title.trim()) return;
    setStartingOuting(true);
    fetch(`${API_BASE_URL}/groups/${group.id}/outings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        title: input.title.trim(),
        ...(input.eventId ? { eventId: input.eventId } : {}),
        ...(input.startsAt ? { startsAt: input.startsAt } : {})
      })
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(() => {
        // The outing is a post now, so the feed is what has to be re-read.
        refreshPosts();
      })
      .catch(() => {})
      .finally(() => setStartingOuting(false));
  };

  const dismissPlacement = (placementId: string) => {
    if (!authToken) return;
    // Optimistic: the banner goes now, and the route returns 204 with
    // nothing to reconcile against.
    setPlacements((current) =>
      current.filter((entry) => entry.id !== placementId)
    );
    void fetch(
      `${API_BASE_URL}/groups/${group.id}/placements/${placementId}`,
      {
        method: 'DELETE',
        headers: { authorization: `Bearer ${authToken}` }
      }
    ).then((response) => {
      if (!response.ok) refreshPlacements();
    });
  };

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

  // The module registry now describes what an outing card offers, since
  // the programme, attendance and checklist belong to an outing rather than
  // to the group. `meetup_point` stays group-level: it is derived from the
  // linked event's venue, not from any one outing.
  const enabledModuleNames = new Set(
    group.modulesConfig
      .filter((entry) => entry.enabled)
      .map((entry) => entry.module)
  );
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
              {group.eventId
                ? t('groups.kindEventLinked')
                : t('groups.kindPermanent')}
            </span>
            <strong className="group-detail-name">
              {group.name}
              {group.verificationStatus === 'verified' && (
            <VerifiedBadge locale={locale} />
          )}
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
                    ? t('groups.unpin')
                    : t('groups.pin')
                }
              >
                {group.pinned ? `📌 ${t('groups.pinned')}` : `📌 ${t('groups.pin')}`}
              </button>
              <button
                type="button"
                className="text-btn"
                onClick={leaveGroupAction}
              >
                {t('groups.leave')}
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
              {t('groups.invite')}
            </button>
          )}
        </div>
      </div>

      {!group.isMember && group.myStatus !== 'pending' && (
        <div className="group-detail-join-banner">
          <p>
            {group.visibility === 'restricted'
              ? t('groups.joinRestrictedPrompt')
              : t('groups.joinOpenPrompt')}
          </p>
          <button
            type="button"
            className="btn-secondary"
            onClick={joinGroupAction}
            disabled={joining}
          >
            {joining
              ? t('groups.joining')
              : group.visibility === 'restricted'
                ? t('groups.askToJoin')
                : t('groups.join')}
          </button>
        </div>
      )}
      {group.myStatus === 'pending' && (
        <div className="group-detail-join-banner">
          <p>{t('groups.pendingRequest')}</p>
        </div>
      )}

      {group.isMember && (
        <>
          <nav className="group-detail-tabs" aria-label="Espaces du groupe">
            <button
              type="button"
              className={tab === 'feed' ? 'active' : ''}
              onClick={() => setTab('feed')}
            >
              <span aria-hidden="true">◌</span>
              {t('groups.tabHome')}
              {posts.length > 0 && <small>{posts.length}</small>}
            </button>
            <button
              type="button"
              className={tab === 'members' ? 'active' : ''}
              onClick={() => setTab('members')}
            >
              <span aria-hidden="true">◎</span>
              {t('groups.tabMembers')}
              <small>{group.memberCount}</small>
            </button>
            {group.isModerator && (
              <button
                type="button"
                className={tab === 'manage' ? 'active' : ''}
                onClick={() => setTab('manage')}
              >
                <span aria-hidden="true">◇</span>
                {t('groups.tabManage')}
                {(group.pendingRequestCount ?? 0) > 0 && (
                  <small className="attention">
                    {group.pendingRequestCount}
                  </small>
                )}
              </button>
            )}
          </nav>

          {tab === 'feed' && (
            <section className="group-detail-discussion group-feed-view">
              <div className="group-feed-channels" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeChannelId === undefined}
                  className={`group-channel-tab ${
                    activeChannelId === undefined ? 'active' : ''
                  }`}
                  onClick={() => setActiveChannelId(undefined)}
                >
                  {t('groups.channelAll')}
                </button>
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
                  </button>
                ))}
                {group.isModerator &&
                  activeChannelId &&
                  channels.length > 1 && (
                    <button
                      type="button"
                      className="group-channel-remove"
                      onClick={() => removeChannel(activeChannelId)}
                      title={t('groups.channelDelete')}
                      aria-label={t('groups.channelDelete')}
                    >
                      ×
                    </button>
                  )}
                {group.isModerator && (
                  <form
                    className="group-channel-add"
                    onSubmit={(submitEvent) => {
                      submitEvent.preventDefault();
                      addChannel();
                    }}
                  >
                    <input
                      value={newChannelName}
                      onChange={(changeEvent) =>
                        setNewChannelName(changeEvent.target.value)
                      }
                      placeholder={t('groups.channelNew')}
                      maxLength={40}
                      aria-label={t('groups.channelNewLabel')}
                    />
                    <label title={t('groups.channelStaffOnly')}>
                      <input
                        type="checkbox"
                        checked={newChannelStaffOnly}
                        onChange={(changeEvent) =>
                          setNewChannelStaffOnly(changeEvent.target.checked)
                        }
                      />
                      {t('groups.channelAnnouncements')}
                    </label>
                    <button
                      type="submit"
                      className="text-btn"
                      disabled={addingChannel || !newChannelName.trim()}
                    >
                      {t('groups.channelAdd')}
                    </button>
                  </form>
                )}
              </div>

              {placements.map((placement) => (
                <GroupSponsoredBanner
                  key={placement.id}
                  placement={placement}
                  canDismiss={group.isModerator}
                  canOrganise={group.isModerator}
                  locale={locale}
                  onOpenEvent={onOpenEventForum}
                  onDismiss={() => dismissPlacement(placement.id)}
                  onOrganise={() =>
                    startOuting({
                      title: placement.event.title,
                      eventId: placement.event.id,
                      startsAt: placement.event.startsAt
                    })
                  }
                />
              ))}

              {group.meetupVenue && enabledModuleNames.has('meetup_point') && (
                <GroupMeetupCard venue={group.meetupVenue} locale={locale} />
              )}
              {!canWriteHere && (
                <p className="group-channel-readonly">
                  {t('groups.channelReadOnly')}
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
                  placeholder={t('groups.composerPlaceholder')}
                  maxLength={2000}
                  rows={3}
                />
                <div className="group-main-composer-footer">
                  <button
                    type="button"
                    className="group-composer-outing-trigger"
                    onClick={() => setOutingComposerOpen((open) => !open)}
                  >
                    📅 {t('groups.proposeOuting')}
                  </button>
                  <span>{draft.length}/2000</span>
                  <button
                    type="submit"
                    className="btn-secondary"
                    disabled={posting || !draft.trim()}
                  >
                    {posting ? t('groups.composerPosting') : t('groups.composerSubmit')}
                  </button>
                </div>
              </form>
              {outingComposerOpen && (
                <form
                  className="group-outing-composer"
                  onSubmit={(submitEvent) => {
                    submitEvent.preventDefault();
                    startOuting({
                      title: outingDraft.title,
                      ...(outingDraft.place ? { place: outingDraft.place } : {}),
                      ...(outingDraft.startsAt
                        ? {
                            startsAt: new Date(
                              outingDraft.startsAt
                            ).toISOString()
                          }
                        : {})
                    });
                    setOutingDraft({ title: '', place: '', startsAt: '' });
                    setOutingComposerOpen(false);
                  }}
                >
                  <input
                    value={outingDraft.title}
                    onChange={(changeEvent) =>
                      setOutingDraft((current) => ({
                        ...current,
                        title: changeEvent.target.value
                      }))
                    }
                    placeholder={t('groups.outingTitlePlaceholder')}
                    maxLength={120}
                    autoFocus
                  />
                  <div className="group-outing-composer-row">
                    <input
                      value={outingDraft.place}
                      onChange={(changeEvent) =>
                        setOutingDraft((current) => ({
                          ...current,
                          place: changeEvent.target.value
                        }))
                      }
                      placeholder={t('groups.outingPlacePlaceholder')}
                      maxLength={120}
                    />
                    <input
                      type="datetime-local"
                      value={outingDraft.startsAt}
                      onChange={(changeEvent) =>
                        setOutingDraft((current) => ({
                          ...current,
                          startsAt: changeEvent.target.value
                        }))
                      }
                      aria-label={t('groups.outingWhenLabel')}
                    />
                    <button
                      type="submit"
                      className="btn-secondary"
                      disabled={startingOuting || !outingDraft.title.trim()}
                    >
                      {t('groups.outingPublish')}
                    </button>
                  </div>
                </form>
              )}
              <div className="forum-posts group-posts-feed">
                {postsState === 'loading' && (
                  <p className="list-view-empty">{t('groups.feedLoading')}</p>
                )}
                {postsState === 'error' && (
                  <p className="list-view-empty">
                    {t('groups.feedError')}
                  </p>
                )}
                {postsState === 'success' && topLevelPosts.length === 0 && (
                  <div className="group-empty-feed">
                    <span aria-hidden="true">◌</span>
                    <strong>{t('groups.feedEmpty')}</strong>
                    <p>
                      {t('groups.feedEmptyHint')}
                    </p>
                  </div>
                )}
                {postsState === 'success' &&
                  topLevelPosts.map((post) =>
                    post.kind === 'outing' && post.outing ? (
                      <GroupOutingCard
                        key={post.id}
                        groupId={group.id}
                        outing={post.outing}
                        authToken={authToken}
                        modules={enabledModuleNames}
                        locale={locale}
                        onAnswered={refreshPosts}
                      />
                    ) : (
                    <GroupPostRow
                      key={post.id}
                      post={post}
                      userId={userId}
                      authToken={authToken}
                      locale={locale}
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
                    )
                  )}
              </div>
            </section>
          )}

          {tab === 'members' && (
            <section className="group-members-view">
              <div className="group-view-heading">
                <div>
                  <span className="groups-page-eyebrow">
                    {t('groups.membersEyebrow')}
                  </span>
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
                          ? t('groups.membersCreator')
                          : t('groups.membersMember')}
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
                    {t('groups.manageEyebrow')}
                  </span>
                  <h2>{t('groups.manageHeading')}</h2>
                </div>
                <span className="group-management-role">
                  {t('groups.manageRole')}
                </span>
              </div>
              <div className="group-management-summary">
                <div>
                  <span>{t('groups.manageAccess')}</span>
                  <strong>
                    {group.visibility === 'restricted'
                      ? t('groups.manageAccessApproval')
                      : t('groups.manageAccessOpen')}
                  </strong>
                </div>
                <div>
                  <span>{t('groups.manageMembers')}</span>
                  <strong>{group.memberCount}</strong>
                </div>
                <div>
                  <span>{t('groups.manageRequests')}</span>
                  <strong>{group.pendingRequestCount ?? 0}</strong>
                </div>
              </div>
              {group.visibility === 'restricted' ? (
                <GroupJoinRequestsCard
                  groupId={group.id}
                  authToken={authToken}
                  locale={locale}
                  onResolved={refreshGroup}
                  showEmpty
                />
              ) : (
                <div className="group-detail-card group-management-empty">
                  <span aria-hidden="true">◎</span>
                  <div>
                    <strong>{t('groups.manageOpenTitle')}</strong>
                    <p>
                      {t('groups.manageOpenBody')}
                    </p>
                  </div>
                </div>
              )}
              <GroupModulesCard
                group={group}
                authToken={authToken}
                locale={locale}
                onGroupUpdated={onGroupUpdated}
              />
              <GroupIdentityCard
                group={group}
                authToken={authToken}
                locale={locale}
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
          locale={locale}
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
function GroupMeetupCard({
  venue,
  locale
}: {
  venue: GroupMeetupVenue;
  locale: SupportedLocale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
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
          <h3>{t('groups.moduleMeetupPointName')}</h3>
          <p>{t('groups.meetupCardHint')}</p>
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
  authToken,
  locale,
  outingId
}: {
  groupId: string;
  authToken: string | undefined;
  locale: SupportedLocale;
  /** Scopes the card to one outing. Absent, the newest one is used. */
  outingId?: string;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  // Memoised so the fetch callbacks below can depend on it: it changes
  // when the card is pointed at a different outing, and a stale base would
  // silently keep reading the previous one.
  const base = useMemo(
    () =>
      outingId
        ? `${API_BASE_URL}/groups/${groupId}/outings/${outingId}`
        : `${API_BASE_URL}/groups/${groupId}`,
    [groupId, outingId]
  );
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
    fetch(`${base}/schedule`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setItems(groupScheduleItemsResponseSchema.parse(json).data);
        setState('success');
      })
      .catch(() => setState('error'));
  }, [authToken, base]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addItem = () => {
    if (!authToken || !label.trim() || !time || adding) return;
    setAdding(true);
    fetch(`${base}/schedule`, {
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
          <h3>{t('groups.moduleProgrammeName')}</h3>
          <p>{t('groups.scheduleHint')}</p>
        </div>
      </div>
      {state === 'loading' && (
        <p className="list-view-empty">{t('groups.loading')}</p>
      )}
      {state === 'success' && items.length === 0 && (
        <p className="list-view-empty">{t('groups.scheduleEmpty')}</p>
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
          placeholder={t('groups.schedulePlaceholder')}
          maxLength={120}
        />
        <button
          type="submit"
          className="text-btn"
          disabled={adding || !label.trim() || !time}
        >
          {t('groups.scheduleAdd')}
        </button>
      </form>
    </div>
  );
}

// "Checklist" - checkedCount/totalMembers reflects real, individual
// members checking an item off for themselves, never a fabricated
// fraction.
function GroupChecklistCard({
  groupId,
  authToken,
  locale,
  outingId
}: {
  groupId: string;
  authToken: string | undefined;
  locale: SupportedLocale;
  /** Scopes the card to one outing. Absent, the newest one is used. */
  outingId?: string;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  // Memoised so the fetch callbacks below can depend on it: it changes
  // when the card is pointed at a different outing, and a stale base would
  // silently keep reading the previous one.
  const base = useMemo(
    () =>
      outingId
        ? `${API_BASE_URL}/groups/${groupId}/outings/${outingId}`
        : `${API_BASE_URL}/groups/${groupId}`,
    [groupId, outingId]
  );
  const [items, setItems] = useState<GroupChecklistItem[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [label, setLabel] = useState('');
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(() => {
    if (!authToken) return;
    setState('loading');
    fetch(`${base}/checklist`, {
      headers: { authorization: `Bearer ${authToken}` }
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        setItems(groupChecklistItemsResponseSchema.parse(json).data);
        setState('success');
      })
      .catch(() => setState('error'));
  }, [authToken, base]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addItem = () => {
    if (!authToken || !label.trim() || adding) return;
    setAdding(true);
    fetch(`${base}/checklist`, {
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
          <h3>{t('groups.moduleChecklistName')}</h3>
          <p>{t('groups.checklistHint')}</p>
        </div>
      </div>
      {state === 'loading' && (
        <p className="list-view-empty">{t('groups.loading')}</p>
      )}
      {state === 'success' && items.length === 0 && (
        <p className="list-view-empty">{t('groups.checklistEmpty')}</p>
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
          placeholder={t('groups.checklistPlaceholder')}
          maxLength={120}
        />
        <button
          type="submit"
          className="text-btn"
          disabled={adding || !label.trim()}
        >
          {t('groups.checklistAdd')}
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
  locale,
  onResolved,
  showEmpty = false
}: {
  groupId: string;
  authToken: string | undefined;
  locale: SupportedLocale;
  onResolved: () => void;
  showEmpty?: boolean;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
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
      <h3>{t('groups.requestsHeading')}</h3>
      {state === 'loading' && (
        <p className="list-view-empty">{t('groups.loading')}</p>
      )}
      {state === 'success' && requests.length === 0 && (
        <div className="group-management-empty-inline">
          <span aria-hidden="true">✓</span>
          <p>{t('groups.requestsEmpty')}</p>
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
              {t('groups.requestsAccept')}
            </button>
            <button
              type="button"
              className="amis-btn-ghost"
              onClick={() => respond(request.id, 'decline')}
            >
              {t('groups.requestsDecline')}
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
  locale,
  onClose
}: {
  group: Group;
  authToken: string | undefined;
  locale: SupportedLocale;
  onClose: () => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
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
        body: translate(locale, 'groups.inviteMessage', {
          name: group.name,
          url
        })
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
          <strong>{t('groups.invite')}</strong>
          <button type="button" className="text-btn" onClick={onClose}>
            {t('groups.close')}
          </button>
        </div>
        <div className="share-friend-list">
          {state === 'loading' && (
            <p className="list-view-empty">{t('groups.loading')}</p>
          )}
          {state === 'error' && (
            <p className="list-view-empty">{t('groups.inviteLoadError')}</p>
          )}
          {state === 'success' && friendsList.length === 0 && (
            <p className="list-view-empty">{t('groups.inviteNoFriends')}</p>
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
                    ? t('groups.inviteSent')
                    : sendingTo === friend.id
                      ? t('groups.inviteSending')
                      : t('groups.inviteAction')}
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
  locale,
  onClose,
  onLeft
}: {
  group: Group;
  authToken: string | undefined;
  userId: string;
  locale: SupportedLocale;
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
          locale={locale}
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
  locale,
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
  locale: SupportedLocale;
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
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
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
            {mine ? t('groups.postAuthorYou') : item.author.displayName}
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
              <span>
                {item.likedByMe ? t('groups.postLiked') : t('groups.postLike')}
              </span>
              {item.likeCount > 0 && <b>{item.likeCount}</b>}
            </button>
            {!isReply && (
              <button
                type="button"
                className="text-btn"
                onClick={onToggleExpanded}
              >
                {item.replyCount === 0
                  ? t('groups.postReply')
                  : translate(
                      locale,
                      item.replyCount === 1
                        ? 'groups.postReplyCount'
                        : 'groups.postReplyCountPlural',
                      { count: item.replyCount }
                    )}
              </button>
            )}
            {mine ? (
              <button
                type="button"
                className="text-btn"
                onClick={() => onDelete(item.id)}
              >
                {t('groups.postDelete')}
              </button>
            ) : (
              <button
                type="button"
                className="text-btn"
                onClick={() => reportContent(authToken, 'group_post', item.id)}
              >
                {t('groups.postReport')}
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
              placeholder={t('groups.postReplyPlaceholder')}
              maxLength={2000}
              rows={1}
            />
            <button
              type="submit"
              className="btn-secondary"
              disabled={posting || !replyDraft.trim()}
            >
              {t('groups.postReply')}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
