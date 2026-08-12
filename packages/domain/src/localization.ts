import type {
  DateFilterValue,
  EventCategory,
  PriceFilterValue,
  TrustLabel
} from './index.js';

export const SUPPORTED_LOCALES = ['fr', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = 'fr';
export const LOCALE_STORAGE_KEY = 'pulso.locale';
export const LOCALE_COOKIE_NAME = 'pulso-locale';

export const SEARCH_MESSAGE_CODES = [
  'search.constraint.maximumPrice',
  'search.constraint.date',
  'search.constraint.category',
  'search.constraint.price',
  'search.constraint.excludeCategory',
  'search.constraint.status',
  'search.constraint.bounds',
  'search.ranking.soon',
  'search.ranking.lowerPrice',
  'search.ranking.higherTrust',
  'search.clarification.location',
  'search.clarification.date',
  'search.clarification.price',
  'search.clarification.atmosphere',
  'search.message.routingUnsupported',
  'search.message.maximumPriceUnavailable',
  'search.message.unsupported',
  'search.message.clarificationRequired',
  'search.message.exactCount',
  'search.message.alternative',
  'search.message.noReliableResult',
  'search.message.montrealOnly',
  'search.reason.category',
  'search.reason.price',
  'search.reason.date',
  'search.reason.soon',
  'search.reason.lowerPriceFree',
  'search.reason.lowerPricePaid',
  'search.reason.lowerPriceUnknown',
  'search.reason.trust',
  'search.reason.eligible',
  'search.reason.venueKind',
  'search.reason.venueKindSecondary',
  'search.reason.nameMatch',
  'search.difference.price',
  'search.difference.category',
  'search.difference.excludedCategory',
  // A named search that matched nothing, answered from the rest of the query
  // instead of dead-ending. Carries the name so the visitor can see which
  // part of what they asked for went unanswered.
  'search.difference.searchText',
  // A named search Pulso's own directory could not answer, so it asked
  // OpenStreetMap and kept what came back. Said plainly rather than folded
  // into the ordinary result count: these places arrived a second ago and
  // have no programming attached, and presenting them as a normal hit would
  // overstate what Pulso knows about them.
  'search.message.foundLive'
] as const;

export type SearchMessageCode = (typeof SEARCH_MESSAGE_CODES)[number];
export interface SearchMessage {
  code: SearchMessageCode;
  params?: Record<string, string | number> | undefined;
}

const en = {
  'app.eyebrow': 'Pulso · Free exploration',
  'app.title': 'Explore Montréal',
  'app.logoHome': 'Pulso — Home',
  'app.description':
    'Explore and filter Montréal events over the next seven calendar days. No account or intelligent search is required.',
  'language.label': 'Language',
  'language.fr': 'Français',
  'language.en': 'English',
  'map.label': 'Montréal event map',
  'map.zoomIn': 'Zoom in',
  'map.zoomOut': 'Zoom out',
  'map.recenter': 'Recenter on my location',
  'map.loading': 'Loading events…',
  'map.empty': 'No events match the active filters in this map area.',
  'map.error': 'Events could not be loaded. Your map context is preserved.',
  'map.basemapLoading': 'Loading map…',
  'map.basemapUnavailable': 'Map unavailable',
  'map.emptyTitle': 'No events found in this area',
  'map.emptySubtitle': 'Try widening your search or clearing your filters.',
  'map.emptyWiden': 'Recenter on Montréal',
  'map.emptyClear': 'Clear filters',
  'map.emptyThisWeek': 'See Montréal this week',
  'map.count.one': '1 matching event in this map area.',
  'map.count.many': '{count} matching events in this map area.',
  'map.previewAria': 'Preview {title}',
  'map.previewButton': 'Preview {title}',
  'common.retry': 'Retry',
  'filters.trigger': 'Filters ({count})',
  'filters.triggerAria': 'Filters, {count} active',
  'filters.activeAria': 'Active filters',
  'filters.default': 'Next 7 days · current map area',
  'filters.clearAria': 'Clear {label} filter',
  'filters.previewClosed':
    'The open event preview was closed because the filters changed.',
  'filters.title': 'Filters',
  'filters.close': 'Close filters',
  'filters.dateTime': 'Date and time',
  'filters.startDate': 'Start date',
  'filters.endDate': 'End date',
  'filters.selectedStartDate': 'Selected start date',
  'filters.selectedEndDate': 'Selected end date',
  'filters.categories': 'Categories',
  'filters.categoriesHelp': 'Multiple categories match with OR.',
  'filters.price': 'Price',
  'filters.priceHelp': 'Unknown prices appear only under All.',
  'filters.distance': 'Distance',
  'filters.ambiance': 'Mood',
  'filters.ambianceHelp': 'Coming soon: AI will determine each event’s mood.',
  'filters.geography': 'Geography',
  'filters.geographyHelp':
    'Current visible map area. Distance is not applied because no reference location was supplied; no routing or implicit location.',
  'filters.status': 'Status',
  'filters.statusHelp':
    'Upcoming and postponed events; cancelled events are excluded.',
  'filters.clearAll': 'Clear all filters',
  'date.next7': 'This week',
  'date.today': 'Today',
  'date.tonight': 'Tonight',
  'date.tomorrow': 'Tomorrow',
  'date.weekend': 'This weekend',
  'date.custom': 'Selected date or range',
  'category.music': 'Music / concerts',
  'category.nightlife': 'Nightlife / DJ / club / qualifying bar events',
  'category.festival': 'Festivals / festive events',
  'category.show': 'Shows',
  'category.comedy': 'Comedy',
  'category.sport': 'Sport',
  'category.other': 'Other qualifying scheduled events',
  'price.all': 'All',
  'price.free': 'Free',
  'price.paid': 'Paid',
  'price.unknown': 'Price unknown',
  'price.paidUnknown': 'Paid — price not confirmed',
  'price.from': 'From {amount}',
  'status.scheduled': 'Scheduled',
  'status.cancelled': 'Cancelled',
  'status.postponed': 'Postponed',
  'trust.confirmed': 'Confirmed',
  'trust.probable': 'Probable',
  'trust.to_verify': 'To verify',
  'trust.conflicting': 'Conflicting',
  'location.confirmed': 'Location confirmed',
  'location.uncertain': 'Location not confirmed',
  'event.descriptionUnknown': 'Description unknown',
  'event.organizerUnknown': 'Organizer unknown',
  'event.warning.cancelled': 'This event is cancelled.',
  'event.warning.postponed':
    'This event is postponed. Check the known schedule before leaving.',
  'event.warning.toVerify': 'Some event information is not confirmed.',
  'event.warning.conflicting': 'Sources disagree about this event.',
  'event.warning.location': 'The event location is uncertain.',
  'event.freshness.stale': 'Information may be stale. Last checked {date}.',
  'event.freshness.unknown':
    'Last checked {date}. No freshness claim is made without an approved policy.',
  'event.external.viewTickets': 'See tickets',
  'event.external.moreInfo': 'More information',
  'event.external.cancelled':
    'The external event or ticket-source action is unavailable because this event is cancelled.',
  'event.external.unavailable':
    'No external destination is currently available. Use the known access information above.',
  'search.panelAria': 'Optional intelligent search',
  'search.expand': 'Intelligent search',
  'search.collapse': 'Collapse search',
  'search.question': 'What do you want to do?',
  'search.placeholder': 'Search for an event, a venue, an artist…',
  'search.submit': 'Search',
  'search.help':
    'Optional deterministic matching. Manual filters always remain available; no external AI provider is used.',
  'search.processing': 'Interpreting request…',
  'search.error':
    'Search could not be completed. The map and manual filters remain available.',
  'search.understood': 'Pulso understood',
  'search.clearSearch': 'Clear search',
  'search.clarificationPrefix': 'One clarification: {message}',
  'search.hardConstraints': 'Hard constraints',
  'search.rankingSignals': 'Ranking signals',
  'search.results': 'Results on this map',
  'search.resultsAria': 'Search result map actions',
  'search.clearConstraint': 'Clear derived constraint {label}',
  'search.clear': 'Clear',
  'search.previewResultAria': 'Preview search result {index}: {matchType}',
  'search.previewResult': 'Preview {title} ({matchType})',
  'search.openRecord': 'Open record',
  'search.openRecordAria': 'Open the record for {title}',
  'search.showOnMap': 'Show on map',
  'search.showOnMapAria': 'Show {title} on the map',
  'search.venueResults': 'Venues',
  'search.suggestedVenue': 'Suggestion',
  'search.suggestedVenueTitle':
    'Imported from OpenStreetMap and not yet reviewed by Pulso.',
  'search.venueResultsAria': 'Venues matching the search',
  'search.searchedFor': 'Searched for “{text}”',
  'search.match.exact': 'exact',
  'search.match.alternative': 'alternative',
  'search.previewClosed':
    'The open event preview was closed because the search interpretation changed.',
  'search.whyExact': 'Why this matches',
  'search.whyAlternative': 'Why this is an alternative',
  'preview.close': 'Close preview',
  'preview.details': 'View event',
  'details.label': 'Event Details',
  'details.back': '← Back to map',
  'details.loading': 'Loading event details…',
  'details.error':
    'Event details could not be loaded. Your map context is preserved.',
  'details.retry': 'Retry details',
  'details.dateTime': 'Date and time',
  'details.venue': 'Venue',
  'details.address': 'Address',
  'details.price': 'Price',
  'details.description': 'Description',
  'details.organizer': 'Organizer',
  'details.access': 'Known access information',
  'details.source': 'Source',
  'details.trust': 'Trust',
  'details.verification': 'Verification',
  'details.externalSuffix': 'external destination',
  'details.externalHint':
    'Opens the identified external destination outside Pulso',
  'details.externalNote':
    'Pulso does not book, charge, store tickets, route, or create an itinerary.',
  'search.constraint.maximumPrice': 'Maximum price CAD {amount}',
  'search.constraint.date': '{date}',
  'search.constraint.category': '{category}',
  'search.constraint.price': '{price}',
  'search.constraint.excludeCategory': 'Exclude {category}',
  'search.constraint.status':
    'Upcoming scheduled or postponed events; cancelled events excluded',
  'search.constraint.bounds': 'Current visible Montréal map area',
  'search.ranking.soon': 'Prefer events starting sooner',
  'search.ranking.lowerPrice': 'Prefer lower-cost known options',
  'search.ranking.higherTrust': 'Prefer more strongly confirmed information',
  'search.clarification.location':
    'Which explicit location should Pulso use as the direct-distance reference? No location is assumed.',
  'search.clarification.date': 'Which one date range should Pulso use?',
  'search.clarification.price': 'Should the price filter be Free or Paid?',
  'search.clarification.atmosphere':
    'What kind of vibe or atmosphere are you looking for?',
  'search.message.routingUnsupported':
    'Pulso cannot interpret travel time because the MVP provides no routing or implicit location.',
  'search.message.maximumPriceUnavailable':
    'Pulso recognized the maximum price, but the current data has no verified numeric prices, so it cannot claim a reliable match.',
  'search.message.unsupported':
    'Pulso could not reliably map this request to the supported event, date, price, or ranking criteria. Manual filters remain available.',
  'search.message.clarificationRequired':
    'One explicit answer is required before Pulso can apply this constraint.',
  'search.message.exactCount.one': '1 exact match found.',
  'search.message.exactCount.many': '{count} exact matches found.',
  'search.message.alternative':
    'No event satisfies every hard constraint. These alternatives differ only as stated.',
  'search.message.noReliableResult':
    'No reliable exact match or one-step explained alternative is available in this map area.',
  'search.message.montrealOnly':
    'Pulso only supports Montreal for now. Other cities will be added later!',
  'search.message.foundLive.one':
    'Not in Pulso yet. 1 matching place was found in OpenStreetMap and added to the directory.',
  'search.message.foundLive.many':
    'Not in Pulso yet. {count} matching places were found in OpenStreetMap and added to the directory.',
  'search.reason.category': 'Category matches: {category}',
  'search.reason.price': 'Price matches: {price}',
  'search.reason.date': 'Date matches: {date}',
  'search.reason.soon':
    'Prioritized because it starts sooner among matching events',
  'search.reason.lowerPriceFree': 'Prioritized because the known price is Free',
  'search.reason.lowerPricePaid': 'Known as Paid; exact price is not confirmed',
  'search.reason.lowerPriceUnknown':
    'Price is unknown and was not treated as lower cost',
  'search.reason.trust': 'Trust information: {trust}',
  'search.reason.eligible':
    'Eligible in the current map area and active event window',
  'search.difference.price': 'Price differs from {price}.',
  'search.difference.category':
    'Event category differs from the requested category filter.',
  'search.difference.excludedCategory':
    'Event category was explicitly excluded in the request.',
  'search.reason.venueKind': 'Held at a {venue}.',
  'search.reason.venueKindSecondary': 'Venue is also a {venue}.',
  'search.reason.nameMatch': 'Name matches “{text}”.',
  'search.difference.searchText':
    'Nothing is named “{text}”. These match the rest of your search.',
  'favorites.showAll': 'Favorites',
  'favorites.showFavoritesOnly': 'My favorites',
  'favorites.add': 'Add to favorites',
  'favorites.remove': 'Remove from favorites',
  'details.share': 'Share',
  'details.shareText': 'Check out this event on Pulso: {title}',

  // Groups (DEC-0013/DEC-0015). Its interface shipped French-only;
  // DEC-0003 requires both languages for every Pulso-owned string.
  'groups.title': 'Groups',
  'groups.eyebrow': 'Pulso communities',
  'groups.tagline': 'Spaces built to turn an idea into a night out.',
  'groups.create': 'Create',
  'groups.createEyebrow': 'New group',
  'groups.createHeading': 'Build your own space',
  'groups.close': 'Close',
  'groups.nameLabel': 'Group name',
  'groups.namePlaceholder': 'e.g. French speakers in Montréal',
  'groups.missionLabel': 'What is it for?',
  'groups.missionPlaceholder': 'Who is it for, and how do you want to organise your outings?',
  'groups.typeLegend': 'What kind of group?',
  'groups.typeCommunity': 'Community',
  'groups.typeCommunityHint': 'Permanent, around a theme. e.g. Techno Montréal.',
  'groups.typeEvent': 'Night out',
  'groups.typeEventHint': 'One specific night, organised end to end.',
  'groups.typeCrew': 'Private crew',
  'groups.typeCrewHint': 'A small circle. Never shown in Discover.',
  'groups.joinLegend': 'How can people join?',
  'groups.joinOpen': 'Open',
  'groups.joinOpenHint': 'Visible and joinable straight away.',
  'groups.joinRestricted': 'On request',
  'groups.joinRestrictedHint': 'Visible, but every entry needs approval.',
  'groups.crewNote': 'A private crew is joined by invitation only.',
  'groups.creating': 'Creating…',
  'groups.createSubmit': 'Create the group',
  'groups.back': 'Groups',
  'groups.emptyEyebrow': 'Your collective space',
  'groups.emptyHeading': 'Organising a night out should never be complicated.',
  'groups.emptyBody': 'Open a group to keep decisions, the schedule, who is coming, the tasks and the conversation in one place.',
  'groups.emptyCta': 'Create my first group',
  'groups.tabMine': 'My groups',
  'groups.tabEvents': 'Events',
  'groups.tabDiscover': 'Discover',
  'groups.searchLabel': 'Search for a group',
  'groups.loading': 'Loading…',
  'groups.loadError': 'Groups cannot be loaded right now.',
  'groups.noMatch': 'No group matches your search.',
  'groups.emptyMine': 'No group yet. Find one in the Discover tab, or join one from “Meet before the event” on a forum.',
  'groups.emptyEvents': 'No event group yet.',
  'groups.emptyDiscover': 'No permanent group yet.',
  'groups.accessOpen': 'Open',
  'groups.accessRestricted': 'On request',
  'groups.roleAdmin': 'Administrator',
  'groups.kindEvent': 'Event group',
  'groups.kindCommunity': 'Community',
  'groups.memberCount': '{count} member',
  'groups.memberCountPlural': '{count} members',
  'groups.verified': 'Verified',
  'groups.verifiedTitle': 'Group verified by Pulso',
  'groups.kindEventLinked': 'Event group',
  'groups.kindPermanent': 'Permanent community',
  'groups.pin': 'Pin to shortcuts',
  'groups.unpin': 'Remove from shortcuts',
  'groups.pinned': 'Pinned',
  'groups.leave': 'Leave',
  'groups.invite': 'Invite friends',
  'groups.joinOpenPrompt': 'Join this group to talk, vote and see the schedule.',
  'groups.joinRestrictedPrompt': 'This group is restricted — your request will be sent to its moderator.',
  'groups.joining': 'One moment…',
  'groups.join': 'Join',
  'groups.askToJoin': 'Ask to join',
  'groups.pendingRequest': 'Request sent, waiting for the moderator to approve it.',
  'groups.tabHome': 'Home',
  'groups.tabMembers': 'Members',
  'groups.tabManage': 'Management',
  'groups.channelAll': 'All',
  'groups.channelNew': 'New thread',
  'groups.channelNewLabel': 'Name of the new thread',
  'groups.channelAnnouncements': 'Announcements',
  'groups.channelStaffOnly': 'Only the administrator can write here',
  'groups.channelAdd': 'Add',
  'groups.channelDelete': 'Delete this thread',
  'groups.channelReadOnly': 'This thread is for the administrator’s announcements. You can read it and react to it.',
  'groups.composerPlaceholder': 'Share an idea, a question or a decision…',
  'groups.composerSubmit': 'Post',
  'groups.composerPosting': 'Posting…',
  'groups.proposeOuting': 'Propose an outing',
  'groups.outingTitlePlaceholder': 'What are we doing? e.g. Techno at Bal du Lezard',
  'groups.outingPlacePlaceholder': 'Where?',
  'groups.outingWhenLabel': 'When?',
  'groups.outingPublish': 'Publish',
  'groups.outingChip': 'Outing',
  'groups.outingNoDate': 'Date to be decided',
  'groups.outingGoing': 'I’m in',
  'groups.outingMaybe': 'Maybe',
  'groups.outingNo': 'No',
  'groups.outingModules': 'Schedule, checklist',
  'groups.feedLoading': 'Loading…',
  'groups.feedError': 'The feed cannot be loaded right now.',
  'groups.feedEmpty': 'Start the first conversation.',
  'groups.feedEmptyHint': 'A simple question is often enough to organise a whole night out.',
  'groups.membersEyebrow': 'The community',
  'groups.membersCreator': 'Group creator',
  'groups.membersMember': 'Member',
  'groups.manageEyebrow': 'Administrator space',
  'groups.manageHeading': 'Manage access to the group.',
  'groups.manageRole': 'Creator · Administrator',
  'groups.manageAccess': 'Access',
  'groups.manageAccessApproval': 'On approval',
  'groups.manageAccessOpen': 'Open',
  'groups.manageMembers': 'Members',
  'groups.manageRequests': 'Requests',
  'groups.manageOpenTitle': 'This group is open.',
  'groups.manageOpenBody': 'Members join without going through a request.',
  // The identity card: the group photo, and the verification a moderator
  // asks for but never grants itself.
  'groups.identityPhotoTitle': 'Group photo',
  'groups.identityPhotoHint': 'It appears everywhere the group is listed.',
  'groups.identityPhotoReplace': 'Replace',
  'groups.identityPhotoAdd': 'Add a photo',
  'groups.identityPhotoRemove': 'Remove',
  'groups.identityPhotoFormatError': 'Unsupported format. Use JPEG, PNG, WebP or GIF.',
  'groups.identityPhotoTooLarge': 'Photo too large.',
  'groups.identityPhotoSaveError': 'The photo could not be saved.',
  'groups.identityPhotoRemoveError': 'The photo could not be removed.',
  'groups.verificationHeading': 'Pulso verification',
  'groups.verificationVerified': 'This group is verified. The badge is visible everywhere it appears.',
  'groups.verificationPending': 'Request sent. A Pulso team will review it.',
  'groups.verificationDeclined': 'The previous request was not accepted. You can submit a new one.',
  'groups.verificationPrompt': 'A verified group reassures the people who do not know it yet.',
  'groups.verificationAsk': 'Ask for verification',
  'groups.verificationLabel': 'Who are you, and what does this group do?',
  'groups.verificationPlaceholder': 'e.g. Techno collective active since 2019, 40 nights a year in the Plateau.',
  'groups.verificationCancel': 'Cancel',
  'groups.verificationSending': 'Sending…',
  'groups.verificationSubmit': 'Send the request',
  'groups.verificationSendError': 'The request could not be sent.',
  // The modules card, and the module registry it lists. These names and
  // descriptions lived in GROUP_MODULE_LABELS, French-only; they are copy
  // the workspace renders, so they belong in the catalogue like the rest.
  'groups.modulesHeading': 'Group modules',
  'groups.modulesHint': 'What the Organise tab shows, and in what order. Disabling a module hides it without erasing what it contains.',
  'groups.modulesSaveError': 'The configuration could not be saved.',
  'groups.modulesMoveUp': 'Move {name} up',
  'groups.modulesMoveDown': 'Move {name} down',
  'groups.modulesUnavailable': 'This group is not linked to any event, so there is nothing to show yet.',
  'groups.modulesEnabled': 'On',
  'groups.modulesHidden': 'Hidden',
  'groups.moduleProgrammeName': 'Schedule',
  'groups.moduleProgrammeDescription': 'The outing hour by hour.',
  'groups.moduleAttendanceName': 'Who is coming?',
  'groups.moduleAttendanceDescription': 'Real attendance, counted from members’ votes.',
  'groups.moduleMeetupPointName': 'Meeting point',
  'groups.moduleMeetupPointDescription': 'Derived from the linked event’s real venue. Absent from a permanent group.',
  'groups.moduleChecklistName': 'Checklist',
  'groups.moduleChecklistDescription': 'What each person has to prepare, ticked off individually.',
  // The sponsored placement (DEC-0015 §Future monetization): always
  // labelled as paid, always naming who paid, always dismissable.
  'groups.sponsoredTag': 'Sponsored · {sponsor}',
  'groups.sponsoredDismissTitle': 'Remove this promotion from the group',
  'groups.sponsoredDismiss': 'Remove',
  'groups.sponsoredCta': 'See the event',
  'groups.sponsoredOrganise': 'Organise this outing',
  // The meetup-point card. Its heading reuses the module name.
  'groups.meetupCardHint': 'The real venue linked to the event.',
  // The schedule card. Its heading reuses the module name.
  'groups.scheduleHint': 'Build the running order for the outing.',
  'groups.scheduleEmpty': 'No schedule yet.',
  'groups.schedulePlaceholder': 'e.g. Meet at the bar',
  'groups.scheduleAdd': '+ Add',
  // The checklist card. Its heading reuses the module name.
  'groups.checklistHint': 'The things to sort out before heading off.',
  'groups.checklistEmpty': 'No item yet.',
  'groups.checklistPlaceholder': 'e.g. Tickets',
  'groups.checklistAdd': '+ Add an item',
  // The join-request queue: the one moderation power a group creator has.
  'groups.requestsHeading': 'Pending requests',
  'groups.requestsEmpty': 'No request to handle right now.',
  'groups.requestsAccept': 'Accept',
  'groups.requestsDecline': 'Decline',
  // The invite modal. It never joins anyone on their behalf (DEC-0013):
  // it sends a direct message carrying a link, in the sender's language.
  'groups.inviteLoadError': 'Your friends cannot be loaded right now.',
  'groups.inviteNoFriends': 'Add friends so you can invite them.',
  'groups.inviteSent': 'Sent ✓',
  'groups.inviteSending': 'Sending…',
  'groups.inviteAction': 'Invite',
  // A post in the feed, and its replies. Plural follows the memberCount
  // pair above: the caller picks the key, the catalogue holds both forms.
  'groups.postAuthorYou': 'You',
  'groups.postLiked': 'Liked',
  'groups.postLike': 'Like',
  'groups.postReply': 'Reply',
  'groups.postReplyCount': '{count} reply',
  'groups.postReplyCountPlural': '{count} replies',
  'groups.postReplyPlaceholder': 'Reply…',
  'groups.postDelete': 'Delete',
  'groups.postReport': 'Report',
  // The showcase on the empty groups page: what a workspace is for, before
  // the visitor has one.
  'groups.showcaseLabel': 'Available modules',
  'groups.showcaseProgramme': 'Shared schedule',
  'groups.showcaseAttendance': 'Real attendance',
  'groups.showcaseChecklist': 'Collective checklist',
  'groups.showcaseDiscussion': 'Group discussion',
  // The directory's context strip: what the selected sub-tab is showing.
  'groups.contextMineTitle': 'Your spaces',
  'groups.contextMineBody': 'Every group you have joined.',
  'groups.contextEventTitle': 'Around events',
  'groups.contextEventBody': 'Groups created to prepare one specific outing.',
  'groups.contextDiscoverTitle': 'Communities to discover',
  'groups.contextDiscoverBody': 'Montréal communities, open or on request.',
  // The compact groups block (sidebar mini-list, Profile tab).
  'groups.blockEmpty': 'No group yet.',
  'groups.blockOpen': 'Open',
  // The workspace header chrome. The open-access badge is its own key: the
  // directory says 'Open' in a tight row, the header spells it out.
  'groups.accessOpenBadge': 'Open access',
  'groups.linkedTo': 'Group linked to',
  'groups.tabsLabel': 'Group spaces',
  'groups.inviteMessage': 'Join the group “{name}” on Pulso!\n{url}',
  'details.linkCopied': 'Link copied to clipboard'
} as const;

export type MessageKey = keyof typeof en;

const fr = {
  'app.eyebrow': 'Pulso · Exploration libre',
  'app.title': 'Explorer Montréal',
  'app.logoHome': 'Pulso — Accueil',
  'app.description':
    'Explorez et filtrez les événements montréalais des sept prochains jours. Aucun compte ni recherche intelligente n’est requis.',
  'language.label': 'Langue',
  'language.fr': 'Français',
  'language.en': 'English',
  'map.label': 'Carte des événements à Montréal',
  'map.zoomIn': 'Zoomer',
  'map.zoomOut': 'Dézoomer',
  'map.recenter': 'Recentrer sur ma position',
  'map.loading': 'Chargement des événements…',
  'map.empty':
    'Aucun événement ne correspond aux filtres actifs dans cette zone.',
  'map.error':
    'Les événements n’ont pas pu être chargés. Le contexte de la carte est conservé.',
  'map.basemapLoading': 'Chargement de la carte…',
  'map.basemapUnavailable': 'Carte indisponible',
  'map.emptyTitle': 'Aucun événement trouvé dans cette zone',
  'map.emptySubtitle': 'Essayez d’élargir votre recherche ou vos filtres.',
  'map.emptyWiden': 'Recentrer sur Montréal',
  'map.emptyClear': 'Effacer les filtres',
  'map.emptyThisWeek': 'Voir Montréal cette semaine',
  'map.count.one': '1 événement correspondant dans cette zone.',
  'map.count.many': '{count} événements correspondants dans cette zone.',
  'map.previewAria': 'Aperçu de {title}',
  'map.previewButton': 'Aperçu de {title}',
  'common.retry': 'Réessayer',
  'filters.trigger': 'Filtres ({count})',
  'filters.triggerAria': 'Filtres, {count} actifs',
  'filters.activeAria': 'Filtres actifs',
  'filters.default': '7 prochains jours · zone visible',
  'filters.clearAria': 'Effacer le filtre {label}',
  'filters.previewClosed':
    'L’aperçu ouvert a été fermé parce que les filtres ont changé.',
  'filters.title': 'Filtres',
  'filters.close': 'Fermer les filtres',
  'filters.dateTime': 'Date et heure',
  'filters.startDate': 'Date de début',
  'filters.endDate': 'Date de fin',
  'filters.selectedStartDate': 'Date de début sélectionnée',
  'filters.selectedEndDate': 'Date de fin sélectionnée',
  'filters.categories': 'Catégories',
  'filters.categoriesHelp': 'Plusieurs catégories sont combinées avec OU.',
  'filters.price': 'Prix',
  'filters.priceHelp': 'Les prix inconnus apparaissent uniquement sous Tous.',
  'filters.distance': 'Distance',
  'filters.ambiance': 'Ambiance',
  'filters.ambianceHelp':
    'Bientôt : une IA déterminera l’ambiance de chaque événement.',
  'filters.geography': 'Zone géographique',
  'filters.geographyHelp':
    'Zone actuellement visible sur la carte. Aucune distance n’est appliquée sans lieu de référence fourni; aucun itinéraire ni emplacement implicite.',
  'filters.status': 'Statut',
  'filters.statusHelp':
    'Événements à venir et reportés; les événements annulés sont exclus.',
  'filters.clearAll': 'Effacer tous les filtres',
  'date.next7': 'Cette semaine',
  'date.today': "Aujourd'hui",
  'date.tonight': 'Ce soir',
  'date.tomorrow': 'Demain',
  'date.weekend': 'Ce week-end',
  'date.custom': 'Date ou période sélectionnée',
  'category.music': 'Musique / concerts',
  'category.nightlife':
    'Vie nocturne / DJ / club / événements admissibles dans un bar',
  'category.festival': 'Festivals / événements festifs',
  'category.show': 'Spectacles',
  'category.comedy': 'Humour',
  'category.sport': 'Sport',
  'category.other': 'Autres événements programmés admissibles',
  'price.all': 'Tous',
  'price.free': 'Gratuit',
  'price.paid': 'Payant',
  'price.unknown': 'Prix inconnu',
  'price.paidUnknown': 'Payant — prix non confirmé',
  'price.from': 'À partir de {amount}',
  'status.scheduled': 'Programmé',
  'status.cancelled': 'Annulé',
  'status.postponed': 'Reporté',
  'trust.confirmed': 'Confirmé',
  'trust.probable': 'Probable',
  'trust.to_verify': 'À vérifier',
  'trust.conflicting': 'Contesté',
  'location.confirmed': 'Lieu confirmé',
  'location.uncertain': 'Lieu non confirmé',
  'event.descriptionUnknown': 'Description inconnue',
  'event.organizerUnknown': 'Organisateur inconnu',
  'event.warning.cancelled': 'Cet événement est annulé.',
  'event.warning.postponed':
    'Cet événement est reporté. Vérifiez l’horaire connu avant de partir.',
  'event.warning.toVerify':
    'Certaines informations sur l’événement ne sont pas confirmées.',
  'event.warning.conflicting':
    'Les sources ne concordent pas au sujet de cet événement.',
  'event.warning.location': 'Le lieu de l’événement est incertain.',
  'event.freshness.stale':
    'Les informations peuvent être périmées. Dernière vérification le {date}.',
  'event.freshness.unknown':
    'Dernière vérification le {date}. Aucune affirmation de fraîcheur n’est faite sans politique approuvée.',
  'event.external.viewTickets': 'Voir les billets',
  'event.external.moreInfo': 'Plus d’informations',
  'event.external.cancelled':
    'L’action vers la source externe de l’événement ou la billetterie est indisponible parce que cet événement est annulé.',
  'event.external.unavailable':
    'Aucune destination externe n’est disponible actuellement. Utilisez les informations d’accès connues ci-dessus.',
  'search.panelAria': 'Recherche intelligente facultative',
  'search.expand': 'Recherche intelligente',
  'search.collapse': 'Réduire la recherche',
  'search.question': 'Que voulez-vous faire?',
  'search.placeholder': 'Rechercher un événement, un lieu, un artiste…',
  'search.submit': 'Rechercher',
  'search.help':
    'Correspondance déterministe facultative. Les filtres manuels restent toujours disponibles; aucun fournisseur d’IA externe n’est utilisé.',
  'search.processing': 'Interprétation de la demande…',
  'search.error':
    'La recherche n’a pas pu être effectuée. La carte et les filtres manuels restent disponibles.',
  'search.understood': 'Pulso a compris',
  'search.clearSearch': 'Effacer la recherche',
  'search.clarificationPrefix': 'Une précision : {message}',
  'search.hardConstraints': 'Contraintes strictes',
  'search.rankingSignals': 'Signaux de classement',
  'search.results': 'Résultats sur cette carte',
  'search.resultsAria': 'Actions des résultats de recherche sur la carte',
  'search.clearConstraint': 'Effacer la contrainte dérivée {label}',
  'search.clear': 'Effacer',
  'search.previewResultAria':
    'Aperçu du résultat de recherche {index} : {matchType}',
  'search.previewResult': 'Aperçu de {title} ({matchType})',
  'search.openRecord': 'Ouvrir la fiche',
  'search.openRecordAria': 'Ouvrir la fiche de {title}',
  'search.showOnMap': 'Voir sur la carte',
  'search.showOnMapAria': 'Voir {title} sur la carte',
  'search.venueResults': 'Lieux',
  'search.suggestedVenue': 'Suggestion',
  'search.suggestedVenueTitle':
    'Importé depuis OpenStreetMap, pas encore vérifié par Pulso.',
  'search.venueResultsAria': 'Lieux correspondant à la recherche',
  'search.searchedFor': 'Recherche de « {text} »',
  'search.match.exact': 'exact',
  'search.match.alternative': 'alternative',
  'search.previewClosed':
    'L’aperçu ouvert a été fermé parce que l’interprétation de recherche a changé.',
  'search.whyExact': 'Pourquoi cet événement correspond',
  'search.whyAlternative': 'Pourquoi cet événement est une alternative',
  'preview.close': 'Fermer l’aperçu',
  'preview.details': 'Voir l’événement',
  'details.label': 'Détails de l’événement',
  'details.back': '← Retour à la carte',
  'details.loading': 'Chargement des détails…',
  'details.error':
    'Les détails n’ont pas pu être chargés. Le contexte de la carte est conservé.',
  'details.retry': 'Réessayer les détails',
  'details.dateTime': 'Date et heure',
  'details.venue': 'Lieu',
  'details.address': 'Adresse',
  'details.price': 'Prix',
  'details.description': 'Description',
  'details.organizer': 'Organisateur',
  'details.access': 'Informations d’accès connues',
  'details.source': 'Source',
  'details.trust': 'Confiance',
  'details.verification': 'Vérification',
  'details.externalSuffix': 'destination externe',
  'details.externalHint':
    'Ouvre la destination externe indiquée à l’extérieur de Pulso',
  'details.externalNote':
    'Pulso ne réserve pas, ne facture pas, ne stocke pas de billets, ne calcule pas d’itinéraire et ne crée pas de parcours.',
  'search.constraint.maximumPrice': 'Prix maximal de {amount} $ CA',
  'search.constraint.date': '{date}',
  'search.constraint.category': '{category}',
  'search.constraint.price': '{price}',
  'search.constraint.excludeCategory': 'Exclure {category}',
  'search.constraint.status':
    'Événements programmés ou reportés à venir; événements annulés exclus',
  'search.constraint.bounds':
    'Zone actuellement visible de la carte de Montréal',
  'search.ranking.soon': 'Privilégier les événements qui commencent plus tôt',
  'search.ranking.lowerPrice': 'Privilégier les options connues moins chères',
  'search.ranking.higherTrust':
    'Privilégier les informations confirmées avec plus de certitude',
  'search.clarification.location':
    'Quel lieu explicite Pulso doit-il utiliser comme référence de distance directe? Aucun emplacement n’est supposé.',
  'search.clarification.date': 'Quelle période Pulso doit-il utiliser?',
  'search.clarification.price':
    'Le filtre de prix doit-il être Gratuit ou Payant?',
  'search.clarification.atmosphere':
    'Quelle ambiance ou style de soirée recherches-tu ?',
  'search.message.routingUnsupported':
    'Pulso ne peut pas interpréter un temps de trajet, car le MVP ne fournit aucun itinéraire ni emplacement implicite.',
  'search.message.maximumPriceUnavailable':
    'Pulso a reconnu le prix maximal, mais les données actuelles ne contiennent aucun prix numérique vérifié; aucune correspondance fiable ne peut donc être affirmée.',
  'search.message.unsupported':
    'Pulso n’a pas pu associer cette demande de manière fiable aux critères pris en charge pour les événements, les dates, les prix ou le classement. Les filtres manuels restent disponibles.',
  'search.message.clarificationRequired':
    'Une réponse explicite est requise avant que Pulso puisse appliquer cette contrainte.',
  'search.message.exactCount.one': '1 correspondance exacte trouvée.',
  'search.message.exactCount.many': '{count} correspondances exactes trouvées.',
  'search.message.foundLive.one':
    'Pas encore dans Pulso. 1 lieu correspondant a été trouvé dans OpenStreetMap et ajouté à l’annuaire.',
  'search.message.foundLive.many':
    'Pas encore dans Pulso. {count} lieux correspondants ont été trouvés dans OpenStreetMap et ajoutés à l’annuaire.',
  'search.message.alternative':
    'Aucun événement ne satisfait toutes les contraintes strictes. Ces alternatives diffèrent uniquement de la manière indiquée.',
  'search.message.noReliableResult':
    'Aucune correspondance exacte fiable ni alternative expliquée en une étape n’est disponible dans cette zone.',
  'search.message.montrealOnly':
    "Pulso ne gère que Montréal pour le moment. D'autres villes arriveront plus tard !",
  'search.reason.category': 'Catégorie correspondante : {category}',
  'search.reason.price': 'Prix correspondant : {price}',
  'search.reason.date': 'Date correspondante : {date}',
  'search.reason.soon':
    'Priorisé parce qu’il commence plus tôt parmi les événements correspondants',
  'search.reason.lowerPriceFree':
    'Priorisé parce que le prix connu est Gratuit',
  'search.reason.lowerPricePaid':
    'Indiqué comme Payant; prix exact non confirmé',
  'search.reason.lowerPriceUnknown':
    'Le prix est inconnu et n’a pas été considéré comme moins cher',
  'search.reason.trust': 'Informations de confiance : {trust}',
  'search.reason.eligible':
    'Admissible dans la zone visible et la période active des événements',
  'search.difference.price': 'Le prix diffère de {price}.',
  'search.difference.category':
    'La catégorie de l’événement diffère du filtre de catégorie demandé.',
  'search.difference.excludedCategory':
    'La catégorie de l’événement a été explicitement exclue dans la demande.',
  'search.reason.venueKind': 'A lieu dans un {venue}.',
  'search.reason.venueKindSecondary': 'Le lieu est aussi un {venue}.',
  'search.reason.nameMatch': 'Le nom correspond à « {text} ».',
  'search.difference.searchText':
    'Rien ne porte le nom « {text} ». Voici ce qui correspond au reste de votre recherche.',
  'favorites.showAll': 'Favoris',
  'favorites.showFavoritesOnly': 'Mes favoris',
  'favorites.add': 'Ajouter aux favoris',
  'favorites.remove': 'Retirer des favoris',
  'details.share': 'Partager',
  'details.shareText': 'Découvre cet événement sur Pulso : {title}',

  // Groups (DEC-0013/DEC-0015). Its interface shipped French-only;
  // DEC-0003 requires both languages for every Pulso-owned string.
  'groups.title': 'Groupes',
  'groups.eyebrow': 'Communautés Pulso',
  'groups.tagline': 'Des espaces conçus pour passer de l’idée à la sortie.',
  'groups.create': 'Créer',
  'groups.createEyebrow': 'Nouveau groupe',
  'groups.createHeading': 'Crée ton espace d’organisation',
  'groups.close': 'Fermer',
  'groups.nameLabel': 'Nom du groupe',
  'groups.namePlaceholder': 'Ex. Français à Montréal',
  'groups.missionLabel': 'Mission du groupe',
  'groups.missionPlaceholder': 'À qui s’adresse le groupe et comment souhaitez-vous organiser les sorties ?',
  'groups.typeLegend': 'Quel genre de groupe ?',
  'groups.typeCommunity': 'Communauté',
  'groups.typeCommunityHint': 'Permanente, autour d’un thème. Ex. Techno Montréal.',
  'groups.typeEvent': 'Sortie',
  'groups.typeEventHint': 'Une soirée précise, à organiser de bout en bout.',
  'groups.typeCrew': 'Crew privé',
  'groups.typeCrewHint': 'Un petit cercle. Invisible dans Découvrir.',
  'groups.joinLegend': 'Comment peut-on rejoindre ?',
  'groups.joinOpen': 'Accès libre',
  'groups.joinOpenHint': 'Visible et accessible immédiatement.',
  'groups.joinRestricted': 'Sur demande',
  'groups.joinRestrictedHint': 'Visible, mais chaque entrée doit être approuvée.',
  'groups.crewNote': 'Un crew privé se rejoint uniquement sur invitation.',
  'groups.creating': 'Création…',
  'groups.createSubmit': 'Créer le groupe',
  'groups.back': 'Groupes',
  'groups.emptyEyebrow': 'Ton espace collectif',
  'groups.emptyHeading': 'Organiser une sortie ne devrait jamais être compliqué.',
  'groups.emptyBody': 'Ouvre un groupe pour retrouver au même endroit les décisions, le programme, les présences, les tâches et la discussion.',
  'groups.emptyCta': 'Créer mon premier groupe',
  'groups.tabMine': 'Mes groupes',
  'groups.tabEvents': 'Événements',
  'groups.tabDiscover': 'Découvrir',
  'groups.searchLabel': 'Rechercher un groupe',
  'groups.loading': 'Chargement…',
  'groups.loadError': 'Impossible de charger les groupes pour le moment.',
  'groups.noMatch': 'Aucun groupe ne correspond à ta recherche.',
  'groups.emptyMine': 'Aucun groupe pour le moment. Découvre-en un dans l’onglet Découvrir, ou rejoins-en un depuis « Rencontrer avant l’événement » sur un forum.',
  'groups.emptyEvents': 'Aucun groupe d’événement pour le moment.',
  'groups.emptyDiscover': 'Aucun groupe permanent pour le moment.',
  'groups.accessOpen': 'Libre',
  'groups.accessRestricted': 'Sur demande',
  'groups.roleAdmin': 'Administrateur',
  'groups.kindEvent': 'Groupe événement',
  'groups.kindCommunity': 'Communauté',
  'groups.memberCount': '{count} membre',
  'groups.memberCountPlural': '{count} membres',
  'groups.verified': 'Vérifié',
  'groups.verifiedTitle': 'Groupe vérifié par Pulso',
  'groups.kindEventLinked': 'Groupe événement',
  'groups.kindPermanent': 'Communauté permanente',
  'groups.pin': 'Épingler dans les raccourcis',
  'groups.unpin': 'Retirer des raccourcis',
  'groups.pinned': 'Épinglé',
  'groups.leave': 'Quitter',
  'groups.invite': 'Inviter des amis',
  'groups.joinOpenPrompt': 'Rejoins ce groupe pour discuter, voter, et voir le programme.',
  'groups.joinRestrictedPrompt': 'Ce groupe est à accès limité — ta demande sera envoyée au modérateur.',
  'groups.joining': 'Un instant…',
  'groups.join': 'Rejoindre',
  'groups.askToJoin': 'Demander à rejoindre',
  'groups.pendingRequest': 'Demande envoyée, en attente d’approbation du modérateur.',
  'groups.tabHome': 'Accueil',
  'groups.tabMembers': 'Membres',
  'groups.tabManage': 'Gestion',
  'groups.channelAll': 'Tout',
  'groups.channelNew': 'Nouveau fil',
  'groups.channelNewLabel': 'Nom du nouveau fil',
  'groups.channelAnnouncements': 'Annonces',
  'groups.channelStaffOnly': 'Seul l’administrateur peut y écrire',
  'groups.channelAdd': 'Ajouter',
  'groups.channelDelete': 'Supprimer ce fil',
  'groups.channelReadOnly': 'Ce fil est réservé aux annonces de l’administrateur. Tu peux le lire et y réagir.',
  'groups.composerPlaceholder': 'Partage une idée, une question ou une décision…',
  'groups.composerSubmit': 'Publier',
  'groups.composerPosting': 'Publication…',
  'groups.proposeOuting': 'Proposer une sortie',
  'groups.outingTitlePlaceholder': 'On fait quoi ? Ex. Techno au Bal du Lezard',
  'groups.outingPlacePlaceholder': 'Où ?',
  'groups.outingWhenLabel': 'Quand ?',
  'groups.outingPublish': 'Publier',
  'groups.outingChip': 'Sortie',
  'groups.outingNoDate': 'Date à définir',
  'groups.outingGoing': 'J’y vais',
  'groups.outingMaybe': 'Peut-être',
  'groups.outingNo': 'Non',
  'groups.outingModules': 'Programme, checklist',
  'groups.feedLoading': 'Chargement…',
  'groups.feedError': 'Impossible de charger le fil pour le moment.',
  'groups.feedEmpty': 'Lance la première conversation.',
  'groups.feedEmptyHint': 'Une question simple suffit souvent à organiser toute une sortie.',
  'groups.membersEyebrow': 'La communauté',
  'groups.membersCreator': 'Créateur du groupe',
  'groups.membersMember': 'Membre',
  'groups.manageEyebrow': 'Espace gestionnaire',
  'groups.manageHeading': 'Gérer les accès au groupe.',
  'groups.manageRole': 'Créateur · Gestionnaire',
  'groups.manageAccess': 'Accès',
  'groups.manageAccessApproval': 'Sur approbation',
  'groups.manageAccessOpen': 'Libre',
  'groups.manageMembers': 'Membres',
  'groups.manageRequests': 'Demandes',
  'groups.manageOpenTitle': 'Ce groupe est en accès libre.',
  'groups.manageOpenBody': 'Les membres le rejoignent sans passer par une demande.',
  // The identity card: the group photo, and the verification a moderator
  // asks for but never grants itself.
  'groups.identityPhotoTitle': 'Photo du groupe',
  'groups.identityPhotoHint': 'Elle apparaît partout où le groupe est listé.',
  'groups.identityPhotoReplace': 'Remplacer',
  'groups.identityPhotoAdd': 'Ajouter une photo',
  'groups.identityPhotoRemove': 'Retirer',
  'groups.identityPhotoFormatError': 'Format non supporté. Utilise JPEG, PNG, WebP ou GIF.',
  'groups.identityPhotoTooLarge': 'Photo trop lourde.',
  'groups.identityPhotoSaveError': 'La photo n’a pas pu être enregistrée.',
  'groups.identityPhotoRemoveError': 'La photo n’a pas pu être retirée.',
  'groups.verificationHeading': 'Vérification Pulso',
  'groups.verificationVerified': 'Ce groupe est vérifié. Le badge est visible partout où il apparaît.',
  'groups.verificationPending': 'Demande envoyée. Une équipe Pulso va l’examiner.',
  'groups.verificationDeclined': 'La demande précédente n’a pas été retenue. Tu peux en soumettre une nouvelle.',
  'groups.verificationPrompt': 'Un groupe vérifié inspire confiance aux personnes qui ne le connaissent pas encore.',
  'groups.verificationAsk': 'Demander la vérification',
  'groups.verificationLabel': 'Qui êtes-vous et que fait ce groupe ?',
  'groups.verificationPlaceholder': 'Ex. Collectif techno actif depuis 2019, 40 soirées par an au Plateau.',
  'groups.verificationCancel': 'Annuler',
  'groups.verificationSending': 'Envoi…',
  'groups.verificationSubmit': 'Envoyer la demande',
  'groups.verificationSendError': 'La demande n’a pas pu être envoyée.',
  // The modules card, and the module registry it lists. These names and
  // descriptions lived in GROUP_MODULE_LABELS, French-only; they are copy
  // the workspace renders, so they belong in the catalogue like the rest.
  'groups.modulesHeading': 'Modules du groupe',
  'groups.modulesHint': 'Ce que l’onglet Organiser affiche, et dans quel ordre. Désactiver un module le masque sans effacer ce qu’il contient.',
  'groups.modulesSaveError': 'La configuration n’a pas pu être enregistrée.',
  'groups.modulesMoveUp': 'Monter {name}',
  'groups.modulesMoveDown': 'Descendre {name}',
  'groups.modulesUnavailable': 'Ce groupe n’est lié à aucun événement, donc rien à afficher pour l’instant.',
  'groups.modulesEnabled': 'Activé',
  'groups.modulesHidden': 'Masqué',
  'groups.moduleProgrammeName': 'Programme',
  'groups.moduleProgrammeDescription': 'Le déroulé de la sortie, heure par heure.',
  'groups.moduleAttendanceName': 'Qui vient ?',
  'groups.moduleAttendanceDescription': 'Les présences réelles, comptées sur les votes des membres.',
  'groups.moduleMeetupPointName': 'Point de rendez-vous',
  'groups.moduleMeetupPointDescription': 'Dérivé du lieu réel de l’événement lié. Absent d’un groupe permanent.',
  'groups.moduleChecklistName': 'Checklist',
  'groups.moduleChecklistDescription': 'Ce que chacun doit préparer, coché individuellement.',
  // The sponsored placement (DEC-0015 §Future monetization): always
  // labelled as paid, always naming who paid, always dismissable.
  'groups.sponsoredTag': 'Sponsorisé · {sponsor}',
  'groups.sponsoredDismissTitle': 'Retirer cette mise en avant du groupe',
  'groups.sponsoredDismiss': 'Retirer',
  'groups.sponsoredCta': 'Voir l’événement',
  'groups.sponsoredOrganise': 'Organiser cette sortie',
  // The meetup-point card. Its heading reuses the module name.
  'groups.meetupCardHint': 'Le lieu réel lié à l’événement.',
  // The schedule card. Its heading reuses the module name.
  'groups.scheduleHint': 'Construisez le déroulé de la sortie.',
  'groups.scheduleEmpty': 'Aucun horaire pour l’instant.',
  'groups.schedulePlaceholder': 'Ex. Rendez-vous au bar',
  'groups.scheduleAdd': '+ Ajouter',
  // The checklist card. Its heading reuses the module name.
  'groups.checklistHint': 'Les choses à prévoir avant de partir.',
  'groups.checklistEmpty': 'Aucun item pour l’instant.',
  'groups.checklistPlaceholder': 'Ex. Billets',
  'groups.checklistAdd': '+ Ajouter un item',
  // The join-request queue: the one moderation power a group creator has.
  'groups.requestsHeading': 'Demandes en attente',
  'groups.requestsEmpty': 'Aucune demande à traiter pour le moment.',
  'groups.requestsAccept': 'Accepter',
  'groups.requestsDecline': 'Refuser',
  // The invite modal. It never joins anyone on their behalf (DEC-0013):
  // it sends a direct message carrying a link, in the sender's language.
  'groups.inviteLoadError': 'Impossible de charger vos amis pour le moment.',
  'groups.inviteNoFriends': 'Ajoute des amis pour pouvoir les inviter.',
  'groups.inviteSent': 'Envoyé ✓',
  'groups.inviteSending': 'Envoi…',
  'groups.inviteAction': 'Inviter',
  // A post in the feed, and its replies. Plural follows the memberCount
  // pair above: the caller picks the key, the catalogue holds both forms.
  'groups.postAuthorYou': 'Vous',
  'groups.postLiked': 'Aimé',
  'groups.postLike': 'J’aime',
  'groups.postReply': 'Répondre',
  'groups.postReplyCount': '{count} réponse',
  'groups.postReplyCountPlural': '{count} réponses',
  'groups.postReplyPlaceholder': 'Répondre…',
  'groups.postDelete': 'Supprimer',
  'groups.postReport': 'Signaler',
  // The showcase on the empty groups page: what a workspace is for, before
  // the visitor has one.
  'groups.showcaseLabel': 'Modules disponibles',
  'groups.showcaseProgramme': 'Programme partagé',
  'groups.showcaseAttendance': 'Présences réelles',
  'groups.showcaseChecklist': 'Checklist collective',
  'groups.showcaseDiscussion': 'Discussion du groupe',
  // The directory's context strip: what the selected sub-tab is showing.
  'groups.contextMineTitle': 'Tes espaces',
  'groups.contextMineBody': 'Tous les groupes que tu as rejoints.',
  'groups.contextEventTitle': 'Autour des événements',
  'groups.contextEventBody': 'Des groupes créés pour préparer une sortie précise.',
  'groups.contextDiscoverTitle': 'Communautés à découvrir',
  'groups.contextDiscoverBody': 'Des communautés montréalaises ouvertes ou sur demande.',
  // The compact groups block (sidebar mini-list, Profile tab).
  'groups.blockEmpty': 'Aucun groupe pour le moment.',
  'groups.blockOpen': 'Ouvrir',
  // The workspace header chrome. The open-access badge is its own key: the
  // directory says 'Libre' in a tight row, the header spells it out.
  'groups.accessOpenBadge': 'Accès libre',
  'groups.linkedTo': 'Groupe lié à',
  'groups.tabsLabel': 'Espaces du groupe',
  'groups.inviteMessage': 'Rejoins le groupe « {name} » sur Pulso !\n{url}',
  'details.linkCopied': 'Lien copié dans le presse-papier'
} satisfies Record<MessageKey, string>;

export const MESSAGE_CATALOGS = { en, fr } as const;

export function normalizeSupportedLocale(
  value: string | null | undefined
): SupportedLocale | undefined {
  const language = value?.trim().toLowerCase().split(/[-_]/, 1)[0];
  return language === 'fr' || language === 'en' ? language : undefined;
}

export function resolveSupportedLocale(
  preferences: readonly (string | null | undefined)[],
  stored?: string | null
): SupportedLocale {
  const storedLocale = normalizeSupportedLocale(stored);
  if (storedLocale) return storedLocale;
  for (const preference of preferences) {
    const locale = normalizeSupportedLocale(preference);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

export function displayLocale(locale: SupportedLocale): 'fr-CA' | 'en-CA' {
  return locale === 'fr' ? 'fr-CA' : 'en-CA';
}

export function translate(
  locale: SupportedLocale,
  key: MessageKey,
  params: Record<string, string | number> = {}
): string {
  return MESSAGE_CATALOGS[locale][key].replace(
    /\{(\w+)\}/g,
    (_match, name: string) => String(params[name] ?? `{${name}}`)
  );
}

export function getDateFilterLabel(
  locale: SupportedLocale,
  date: DateFilterValue
): string {
  return translate(locale, `date.${date}` as MessageKey);
}

export function getCategoryLabel(
  locale: SupportedLocale,
  category: EventCategory
): string {
  return translate(locale, `category.${category}` as MessageKey);
}

export function getPriceLabel(
  locale: SupportedLocale,
  price: PriceFilterValue
): string {
  return translate(locale, `price.${price}` as MessageKey);
}

export function getTrustLabel(
  locale: SupportedLocale,
  trust: TrustLabel
): string {
  return translate(locale, `trust.${trust}` as MessageKey);
}

export function formatMontrealDateTime(
  value: string | Date,
  locale: SupportedLocale
): string {
  return new Intl.DateTimeFormat(displayLocale(locale), {
    timeZone: 'America/Toronto',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(new Date(value));
}

export function formatMontrealDate(
  value: string | Date,
  locale: SupportedLocale
): string {
  return new Intl.DateTimeFormat(displayLocale(locale), {
    timeZone: 'America/Toronto',
    dateStyle: 'medium'
  }).format(new Date(value));
}

export function formatCad(amount: number, locale: SupportedLocale): string {
  return new Intl.NumberFormat(displayLocale(locale), {
    style: 'currency',
    currency: 'CAD'
  }).format(amount);
}

export function localizeSearchMessage(
  locale: SupportedLocale,
  message: SearchMessage
): string {
  const params = { ...message.params };
  const category = params.category as EventCategory | undefined;
  const date = params.date as DateFilterValue | undefined;
  const price = params.price as PriceFilterValue | undefined;
  const trust = params.trust as TrustLabel | undefined;
  if (category) params.category = getCategoryLabel(locale, category);
  if (date) params.date = getDateFilterLabel(locale, date);
  if (price) params.price = getPriceLabel(locale, price);
  if (trust) params.trust = getTrustLabel(locale, trust);
  if (
    message.code === 'search.message.exactCount' ||
    message.code === 'search.message.foundLive'
  ) {
    const count = Number(params.count ?? 0);
    return translate(
      locale,
      `${message.code}.${count === 1 ? 'one' : 'many'}` as MessageKey,
      params
    );
  }
  return translate(locale, message.code as MessageKey, params);
}
