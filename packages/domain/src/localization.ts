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
  'common.loading': 'Loading…',
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
  // DEC-0017: a record created through the account layer carries no
  // DATA-0001 trust label, so its provenance is stated instead. Descriptive,
  // never evaluative - none of these three is a verdict on the information.
  'details.origin': 'Origin',
  'details.origin.directory': 'Pulso directory',
  'details.origin.verified_organizer': 'Verified organizer',
  'details.origin.community': 'Submitted by the community',
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
  'groups.missionPlaceholder':
    'Who is it for, and how do you want to organise your outings?',
  'groups.typeLegend': 'What kind of group?',
  'groups.typeCommunity': 'Community',
  'groups.typeCommunityHint':
    'Permanent, around a theme. e.g. Techno Montréal.',
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
  'groups.emptyBody':
    'Open a group to keep decisions, the schedule, who is coming, the tasks and the conversation in one place.',
  'groups.emptyCta': 'Create my first group',
  'groups.tabMine': 'My groups',
  'groups.tabEvents': 'Events',
  'groups.tabDiscover': 'Discover',
  'groups.searchLabel': 'Search for a group',
  'groups.loading': 'Loading…',
  'groups.loadError': 'Groups cannot be loaded right now.',
  'groups.noMatch': 'No group matches your search.',
  'groups.emptyMine':
    'No group yet. Find one in the Discover tab, or join one from “Meet before the event” on a forum.',
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
  'groups.joinOpenPrompt':
    'Join this group to talk, vote and see the schedule.',
  'groups.joinRestrictedPrompt':
    'This group is restricted — your request will be sent to its moderator.',
  'groups.joining': 'One moment…',
  'groups.join': 'Join',
  'groups.askToJoin': 'Ask to join',
  'groups.pendingRequest':
    'Request sent, waiting for the moderator to approve it.',
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
  'groups.channelReadOnly':
    'This thread is for the administrator’s announcements. You can read it and react to it.',
  'groups.composerPlaceholder': 'Share an idea, a question or a decision…',
  'groups.composerSubmit': 'Post',
  'groups.composerPosting': 'Posting…',
  'groups.proposeOuting': 'Propose an outing',
  'groups.outingTitlePlaceholder':
    'What are we doing? e.g. Techno at Bal du Lezard',
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
  'groups.feedEmptyHint':
    'A simple question is often enough to organise a whole night out.',
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
  'groups.identityPhotoFormatError':
    'Unsupported format. Use JPEG, PNG, WebP or GIF.',
  'groups.identityPhotoTooLarge': 'Photo too large.',
  'groups.identityPhotoSaveError': 'The photo could not be saved.',
  'groups.identityPhotoRemoveError': 'The photo could not be removed.',
  'groups.verificationHeading': 'Pulso verification',
  'groups.verificationVerified':
    'This group is verified. The badge is visible everywhere it appears.',
  'groups.verificationPending': 'Request sent. A Pulso team will review it.',
  'groups.verificationDeclined':
    'The previous request was not accepted. You can submit a new one.',
  'groups.verificationPrompt':
    'A verified group reassures the people who do not know it yet.',
  'groups.verificationAsk': 'Ask for verification',
  'groups.verificationLabel': 'Who are you, and what does this group do?',
  'groups.verificationPlaceholder':
    'e.g. Techno collective active since 2019, 40 nights a year in the Plateau.',
  'groups.verificationCancel': 'Cancel',
  'groups.verificationSending': 'Sending…',
  'groups.verificationSubmit': 'Send the request',
  'groups.verificationSendError': 'The request could not be sent.',
  // The modules card, and the module registry it lists. These names and
  // descriptions lived in GROUP_MODULE_LABELS, French-only; they are copy
  // the workspace renders, so they belong in the catalogue like the rest.
  'groups.modulesHeading': 'Group modules',
  'groups.modulesHint':
    'What the Organise tab shows, and in what order. Disabling a module hides it without erasing what it contains.',
  'groups.modulesSaveError': 'The configuration could not be saved.',
  'groups.modulesMoveUp': 'Move {name} up',
  'groups.modulesMoveDown': 'Move {name} down',
  'groups.modulesUnavailable':
    'This group is not linked to any event, so there is nothing to show yet.',
  'groups.modulesEnabled': 'On',
  'groups.modulesHidden': 'Hidden',
  'groups.moduleProgrammeName': 'Schedule',
  'groups.moduleProgrammeDescription': 'The outing hour by hour.',
  'groups.moduleAttendanceName': 'Who is coming?',
  'groups.moduleAttendanceDescription':
    'Real attendance, counted from members’ votes.',
  'groups.moduleMeetupPointName': 'Meeting point',
  'groups.moduleMeetupPointDescription':
    'Derived from the linked event’s real venue. Absent from a permanent group.',
  'groups.moduleChecklistName': 'Checklist',
  'groups.moduleChecklistDescription':
    'What each person has to prepare, ticked off individually.',
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
  'post.authorYou': 'You',
  'post.liked': 'Liked',
  'post.like': 'Like',
  'post.reply': 'Reply',
  'post.replyCount': '{count} reply',
  'post.replyCountPlural': '{count} replies',
  'post.replyPlaceholder': 'Reply…',
  'post.delete': 'Delete',
  'post.report': 'Report',
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
  // Shared chrome that is not a group concern: relative timestamps, and
  // the content-report prompt. Both live in apps/web/app/shared.tsx and
  // are called from the map surface as well as the group workspace.
  'time.justNow': 'just now',
  'time.minutesAgo': '{count} min ago',
  'time.hoursAgo': '{count}h ago',
  'time.daysAgo': '{count}d ago',
  'report.prompt': 'Why are you reporting this content? (optional)',
  'report.sent': 'Report sent.',
  // The map surface (explore-map.tsx). Marker pickers open only when two
  // or more pins overlap, so their labels have no singular form.
  'map.eventsHere': '{count} events at this spot',
  'map.venuesHere': '{count} venues at this spot',
  'map.venuesInArea': '{count} venues in this area',
  'map.eventCount': '{count} event in this area',
  'map.eventCountPlural': '{count} events in this area',
  'map.venueCount': '{count} venue in this area',
  'map.venueCountPlural': '{count} venues in this area',
  'map.youAreHere': 'You are here',
  // The shell's navigation: the desktop top bar and the mobile bottom nav
  // with its Community sheet.
  'nav.events': 'Events',
  'nav.venues': 'Venues',
  'nav.community': 'Community',
  'nav.messages': 'Messages',
  'nav.forums': 'Forums',
  'nav.groups': 'Groups',
  'nav.friends': 'Friends',
  'nav.about': 'About',
  'nav.notificationsSoon': 'Notifications (coming soon)',
  'nav.comingSoon': 'Coming soon',
  // The connected experience's primary sidebar (DEC-0020). Forums,
  // Groupes, Messages and Amis are no longer primary entries: they are
  // sub-sections of Communauté, which is why only the hub is listed here.
  'sidebar.discover': 'Discover',
  'sidebar.map': 'Map',
  'sidebar.favorites': 'Favorites',
  'sidebar.organizer': 'Organizer',
  'sidebar.administration': 'Administration',
  // The profile page's DEC-0020 surfaces: the uploaded profile photo and
  // the personal photo gallery. The rest of the profile is still
  // hard-coded French and is being translated batch by batch.
  'profile.tabPhotos': 'Photos',
  'profile.tabFriends': 'Friends',
  'profile.tabFollowedVenues': 'Followed venues',
  'profile.followedVenuesEmpty':
    'No followed venue yet. Follow one to hear about its next events.',
  'profile.photoChange': 'Change photo',
  'profile.photoAdd': 'Add a photo',
  'profile.photoRemove': 'Remove photo',
  'profile.photoUploading': 'Uploading…',
  'profile.photoFailed': 'The photo could not be uploaded.',
  'profile.galleryAdd': 'Add a photo',
  'profile.galleryEmpty': 'No photo yet. Add one to fill your profile.',
  'profile.galleryEmptyOther': 'No photo shared.',
  'profile.galleryPrivate': 'This gallery is visible to friends only.',
  'profile.galleryDelete': 'Delete this photo',
  'profile.galleryCaption': 'Caption (optional)',
  'profile.friendsEmpty': 'No friends yet.',
  // DEC-0021 - image screening. Deliberately quiet: an approved image says
  // nothing at all, and the two other outcomes say what happened in one
  // sentence without explaining the machinery behind it.
  'moderation.rejected':
    'This image cannot be published because it does not follow the Pulso rules.',
  'moderation.pending': 'Your photo is being checked.',
  'moderation.report': 'Report this photo',
  'moderation.reportSent': 'Thank you, this photo has been reported.',
  'moderation.reason.sexual': 'Sexual content',
  'moderation.reason.violence': 'Violence',
  'moderation.reason.hate': 'Hateful or offensive',
  'moderation.reason.spam': 'Spam',
  'moderation.reason.inappropriate': 'Inappropriate photo',
  'moderation.reason.other': 'Other',
  'admin.moderation.title': 'Image moderation',
  'admin.moderation.empty': 'No image is waiting for a decision.',
  'admin.moderation.approve': 'Approve',
  'admin.moderation.remove': 'Remove',
  'admin.moderation.reports': '{count} report(s)',
  'admin.moderation.automatic': 'Automatic verdict',
  'friends.theirPhotos': 'Their moments',
  'friends.writeTo': 'Write a message',
  // DEC-0020 - the docked messaging panel, present on every connected
  // screen so a conversation never requires navigating away from what the
  // user was doing.
  'dock.title': 'Messages',
  'dock.open': 'Open messages',
  'dock.close': 'Close messages',
  'dock.back': 'Back to conversations',
  'dock.empty': 'No conversation yet.',
  'dock.compose': 'Write a message…',
  'dock.send': 'Send',
  'dock.requests': 'Requests',
  'dock.requestsEmpty': 'No message request.',
  'dock.accept': 'Accept',
  'dock.decline': 'Decline',
  'dock.conversations': 'Conversations',
  'dock.seeAll': 'Open the full inbox',
  'dock.sendFailed': 'The message could not be sent.',
  'view.map': 'Map',
  'view.list': 'List',
  'view.calendar': 'Calendar',
  // The sidebar filter panel, on top of the filters.* keys the overlay
  // already uses.
  'filters.reset': 'Reset',
  'filters.date': 'Date',
  'filters.categoryLegendHint':
    'Each category’s colour matches its pins on the map.',
  'filters.venueCategory': 'Venue type',
  'filters.venueDateHint': 'Shows venues with an event in this period.',
  'filters.radiusActive': 'Active radius: {km} km',
  'filters.radiusMax': 'Max radius ({km} km) — not applied',
  'filters.geoPending': 'locating…',
  'filters.geoDenied': 'location not shared',
  'filters.geoUnsupported': 'not available on this device',
  'filters.showAllEvents': 'Show all events',
  'filters.showFavoritesOnly': 'Show only my favourites',
  'filters.showAllVenues': 'Show all venues',
  'filters.showFollowedVenuesOnly': 'Show only the venues I follow',
  'filters.followedVenues': 'Followed venues',
  // The map's own chrome: recentre controls, the pin-kind toggles and the
  // legend. 'Montréal' itself is a proper noun and stays as written.
  'map.recenterShort': 'Recenter',
  'map.recenterMontreal': 'Recenter on Montréal',
  'map.exploreMontreal': 'Explore Montréal',
  'map.explorePeriod': 'Exploration period',
  'map.pinAll': 'All',
  'map.legend': 'Legend',
  'map.legendMarkers': 'Markers',
  'map.legendEvent': 'Scheduled event',
  'map.legendVenue': 'Recurring venue',
  'map.markerCount': '{count} marker',
  'map.markerCountPlural': '{count} markers',
  // The mobile-app promo card in the sidebar.
  'promo.downloadTitle': 'Download Pulso',
  'promo.downloadBody': 'Take the city with you.',
  'promo.comingSoonOn': 'Coming soon on',
  // The signed-out landing: the nearby carousel and the four feature cards
  // under it.
  'landing.nearbyTitle': 'Events near you',
  'landing.nearbyListTitle': 'Events closest to you',
  'landing.seeAllEvents': 'See all events',
  'landing.noEvents': 'No event found.',
  'landing.featureMapTitle': 'Smart map',
  'landing.featureMapBody':
    'Explore your city and discover events around you in real time.',
  'landing.featureSearchTitle': 'Powerful search',
  'landing.featureSearchBody':
    'Find exactly what you are looking for with search and our suggestions.',
  'landing.featureFavoritesTitle': 'Your favourites',
  'landing.featureFavoritesBody':
    'Save the events you love and never miss a night out.',
  'landing.featureCommunityTitle': 'Community',
  'landing.featureCommunityBody':
    'Join thousands of enthusiasts and share your best finds.',
  // The notification feed. Each row is a sentence built around one or two
  // bold names, and every one of these keeps the same word order in both
  // languages - which is what lets them be keyed as fragments.
  'notif.title': 'Notifications',
  'notif.close': 'Close',
  'notif.unread': 'Unread',
  'notif.loadError': 'Your notifications cannot be loaded.',
  'notif.emptyTitle': 'Nothing new',
  'notif.emptyBody':
    'Follow a venue to be notified as soon as it schedules something.',
  'notif.venueAdded': 'just added',
  'notif.friendRequest': 'sent you a friend request',
  'notif.friendAccepted': 'accepted your friend request',
  'notif.messageReceived': 'sent you a message',
  'notif.forumReply': 'posted in the forum for',
  'notif.organizerRequest': 'is asking to manage',
  'notif.organizerApproved': 'You are a verified organizer of',
  'notif.requestFor': 'Your request for',
  'notif.declined': 'was not accepted',
  'notif.groupVerificationRequest': 'is requesting verification for',
  'notif.groupVerified': 'is now a verified group',
  'notif.groupVerificationOf': 'Verification of',
  'notif.groupJoinRequest': 'is asking to join',
  'notif.groupJoined': 'You have joined',
  'notif.eventStartsSoon': 'starts soon at',
  'event.noUpcoming': 'No upcoming event right now',
  'event.upcomingCount': '{count} upcoming event',
  'event.upcomingCountPlural': '{count} upcoming events',
  // The event forum: its panel, its four rooms, and the discovery cards
  // that lead into it.
  'forum.panelLabel': 'Event forum',
  'forum.meetupCta': 'Meet before the event',
  'forum.meetupLoading': 'One moment…',
  'forum.signInDiscussion':
    'Sign in to read and take part in this event’s forum.',
  'forum.signInPhotos': 'Sign in to see and share photos of this event.',
  'forum.emptyDiscussion':
    'Nobody has written here yet. Start the discussion in the Discussion tab!',
  'forum.membersLoadError': 'Members cannot be loaded right now.',
  'forum.attendanceGoing': '✓ You are going',
  'forum.attendanceGo': '🎟️ I am going',
  'forum.empty': 'Nobody has written here yet.',
  'forum.aboutEvent': 'About the event',
  'forum.seeEvent': 'See the event',
  'forum.rulesTitle': 'Forum rules',
  'forum.ruleNoSpam': 'No spam or advertising',
  'forum.ruleResale': 'Ticket resale peer-to-peer only',
  'forum.ruleOnTopic': 'Stay on the subject of the event',
  'forum.aboutSpaceTitle': 'A space for this event',
  'forum.aboutSpaceBody':
    'Talk about “{title}”, ask your questions and find people to go with.',
  'forum.aboutOnceTitle': 'One message, once',
  'forum.aboutOnceBody':
    'A published message cannot be edited afterwards — only deleted by its author.',
  'forum.aboutResaleTitle': 'Peer-to-peer resale',
  'forum.aboutResaleBody':
    'Ticket resale between attendees stays entirely peer-to-peer — Pulso is never a party to it.',
  'forum.aboutReportTitle': 'Reporting',
  'forum.aboutReportBody':
    'Every message can be reported. Stay courteous towards other attendees.',
  'forum.photoUploadError':
    'Upload failed. Try again with a JPEG, PNG, WebP or GIF photo.',
  'forum.photosEmpty': 'No photo yet. Share the first one!',
  'forum.agoraEyebrow': 'The event’s agora',
  'forum.agoraBody':
    'Four rooms, one event: go straight to the conversation you care about.',
  'forum.roomSelected': 'Selected room',
  'forum.resaleDisclaimer': 'Private sales only.',
  'forum.resaleDisclaimerBody':
    'Pulso takes no part in the transaction: no payment and no ticket goes through the platform.',
  'forum.writeInRoom': 'Write in the {room} room',
  'forum.discoverActive': 'Active discussion',
  'forum.discoverToStart': 'To be started',
  'forum.discoverStartFirst': 'Start the first discussion for this event.',
  'forum.discoverTitle': 'A discussion to discover',
  'forum.discoverOpen':
    'The conversation is open. Be the first to raise a subject.',
  'forum.communityTitle': 'The Pulso community · Montréal',
  'forum.communityBody':
    'Find who to go with, swap tips and meet the people who bring each event to life.',
  'forum.perEvent': 'per event',
  'forum.yourChoice': 'your call',
  'forum.oneDiscussionPerEvent':
    'One dedicated discussion for every upcoming event.',
  'forum.noUpcomingEvents': 'No upcoming event right now.',
  // The four forum rooms. Their names came from FORUM_CATEGORY_LABELS in
  // the domain package and the rest from FORUM_ROOM_PRESENTATION here,
  // both French-only; the icons stay in the component.
  'forum.roomGeneral': 'General discussion',
  'forum.roomGeneralDescription':
    'Questions, tips and impressions about the outing.',
  'forum.roomGeneralPlaceholder': 'Ask a question or share a good tip…',
  'forum.roomGeneralEmpty':
    'Ask the first question or share your tip about the night.',
  'forum.roomPartners': 'Find partners',
  'forum.roomPartnersDescription':
    'Introduce yourself and find people to go with.',
  'forum.roomPartnersPlaceholder':
    'Say who you are and who you would like to go with…',
  'forum.roomPartnersEmpty':
    'Introduce yourself and suggest a meeting point before the event.',
  'forum.roomResale': 'Ticket resale',
  'forum.roomResaleDescription': 'Ticket offers between community members.',
  'forum.roomResalePlaceholder':
    'Clearly describe the ticket you are offering or looking for…',
  'forum.roomResaleEmpty':
    'State the kind of ticket wanted or offered, without sharing sensitive details.',
  'forum.roomFindSomeone': 'Find someone who was there',
  'forum.roomFindSomeoneDescription':
    'Find a person you crossed paths with during the event.',
  'forum.roomFindSomeonePlaceholder':
    'Describe the context of your meeting, respectfully…',
  'forum.roomFindSomeoneEmpty':
    'Describe the moment and place of the meeting plainly to start the search.',
  // The forum panel's five tabs.
  'forum.tabDiscussion': 'Discussion',
  'forum.tabEvent': 'Event',
  'forum.tabMembers': 'Members',
  'forum.tabPhotos': 'Photos',
  'forum.tabAbout': 'About',
  // EventForum's own chrome.
  'forum.chooseSpace': 'Choose your discussion space',
  'forum.roomsLabel': 'Forum rooms',
  'forum.messageCount': '{count} message',
  'forum.messageCountPlural': '{count} messages',
  'forum.messageWord': 'message',
  'forum.messageWordPlural': 'messages',
  'forum.posting': 'Posting…',
  'forum.post': 'Post',
  'forum.photoUploading': 'Uploading…',
  'forum.photoAdd': '📷 Add a photo',
  'forum.photosLoadError': 'Photos cannot be loaded right now.',
  'forum.photoDelete': 'Delete this photo',
  'forum.participantCount': '{count} participant',
  'forum.participantCountPlural': '{count} participants',
  'forum.participantWord': 'participant',
  'forum.participantWordPlural': 'participants',
  'forum.openSpotlight': 'Open the featured discussion for {title}',
  'forum.enterDiscussion': 'Enter the discussion',
  // Messages: the inbox, its tabs and its empty states.
  'messages.title': 'Messages',
  'messages.eyebrow': 'Your Pulso circle',
  'messages.tagline': 'Plan your next outings, simply.',
  'messages.compose': 'New message',
  'messages.write': 'Write',
  'messages.conversationWord': 'conversation',
  'messages.conversationWordPlural': 'conversations',
  'messages.unreadWord': 'unread',
  'messages.unreadWordPlural': 'unread',
  'messages.tabDiscussions': 'Discussions',
  'messages.tabRequests': 'Requests',
  'messages.tabGroups': 'Groups',
  'messages.search': 'Search a conversation',
  'messages.loadError': 'Your messages cannot be loaded right now.',
  'messages.readyTitle': 'Your discussion space is ready.',
  'messages.readyBody': 'Add friends, then start the first conversation.',
  'messages.noResult': 'No result.',
  'messages.privateEyebrow': 'Private conversations',
  'messages.privateTitle': 'The best outings often start with a message.',
  'messages.privateBody':
    'Pick a friend or a group to plan, share an event and decide together.',
  'messages.writeToFriend': 'Write to a friend',
  'messages.privateConversation': 'Private conversation',
  'messages.canExchange': 'You can talk because you are friends on Pulso.',
  'messages.betweenFriends': 'Between friends',
  'messages.newConnections': 'New connections',
  'messages.friendRequests': 'Friend requests',
  'messages.requestsHint': 'Once accepted, a private conversation can begin.',
  'messages.requestsLoadError': 'Your requests cannot be loaded right now.',
  'messages.allUpToDate': 'Everything is up to date.',
  'messages.noPendingRequests': 'No pending request right now.',
  'messages.toConfirm': 'To confirm',
  'messages.sent': 'Sent',
  'messages.accept': 'Accept',
  'messages.decline': 'Decline',
  'messages.composeHint': 'Pick a friend to start or resume a conversation.',
  'messages.friendsLoadError': 'Your friends cannot be loaded right now.',
  'messages.noFriendsToWrite': 'Add friends so you can write to them.',
  // The friends page, the friend panel and the two invite modals.
  'friends.title': 'My friends',
  'friends.eyebrow': 'Your Pulso circle',
  'friends.tagline': 'Find the people to live Montréal with.',
  'friends.invite': 'Invite a friend',
  'friends.circleSummary': 'Summary of your circle',
  'friends.friendsWord': 'friends',
  'friends.havePlans': 'have a visible outing',
  'friends.requestWord': 'request',
  'friends.requestWordPlural': 'requests',
  'friends.search': 'Search a friend',
  'friends.tabCircle': 'My circle',
  'friends.tabRequests': 'Requests',
  'friends.tabSuggestions': 'Suggestions',
  'friends.tabDiscover': 'To discover',
  'friends.noFriendsYet': 'No friend yet',
  'friends.shareCodeHint': 'Share your code to start connecting.',
  'friends.messageShort': 'Message',
  'friends.removeShort': 'Remove',
  'friends.confirmRemove': 'Remove this person from your friends?',
  'friends.loadError': 'Your friends cannot be loaded right now.',
  'friends.inCircle': 'In your circle',
  'friends.sendMessage': 'Send a message',
  'friends.removeFriend': 'Remove this friend',
  'friends.noRequests': 'No friend request right now.',
  'friends.noSuggestions':
    'No suggestion yet - add friends to discover new ones through your mutual connections.',
  'friends.panelHint':
    'See the outings they share, the events you have in common, and start planning your next night out.',
  'friends.inviteNewPerson': 'Invite a new person',
  'friends.upcomingWithCircle': 'upcoming with their circle.',
  'friends.sharedOutingsHint':
    'The outings your friends share will appear here.',
  'friends.goingTo': 'Going to {title}',
  'friends.mutualCount': '{count} mutual friend',
  'friends.mutualCountPlural': '{count} mutual friends',
  'friends.noBio': 'No bio shared yet.',
  'friends.noCommonEvents': 'No event in common yet.',
  'friends.nothingToShow': 'Nothing to show yet.',
  'friends.markAttendanceFirst':
    'Mark your attendance at an event to be able to invite them.',
  'friends.inviteSent': 'Sent ✓',
  'friends.inviteError': 'The request could not be sent right now.',
  'friends.copied': 'Copied!',
  'friends.pasteCode': 'Paste a friend’s code to add them',
  'friends.codeToAdd': 'Friend code to add',
  'friends.noSharedOutings': 'No friend has a shared upcoming outing yet.',
  'friends.conversationError': 'The conversation could not be loaded.',
  'friends.conversationHint':
    'An event to share or an outing to plan? Write the first message.',
  'friends.requestsSent': 'Sent requests',
  'friends.pending': 'Pending',
  'friends.add': '+ Add',
  'friends.circleWaiting': 'Your circle is waiting',
  'friends.pickAFriend': 'Pick a friend',
  'friends.circleMoving': 'Your circle is on the move',
  'friends.sharedOutingOne':
    'friend has shared an upcoming outing with their circle.',
  'friends.sharedOutingMany':
    'friends have shared an upcoming outing with their circle.',
  'friends.seeOnMap': 'See on the map',
  'friends.upcoming': 'Upcoming',
  'friends.circleOutings': 'Circle outings',
  'friends.yourMeetups': 'Your meetups',
  'friends.commonEvents': 'Events in common',
  'friends.sharedHistory': 'Shared history',
  'friends.recentActivity': 'Recent activity',
  'forum.heroTitle': 'The discussions that make you want to go out.',
  'forum.heroCta': 'Explore the discussions',
  'forum.roomsAvailable': 'Available rooms',
  'forum.orbitForum': 'Forum',
  'forum.orbitDiscussion': 'Discussion',
  'forum.orbitTogether': 'Going together',
  'forum.orbitTickets': 'Tickets',
  'forum.orbitFindEachOther': 'Finding each other',
  'forum.statEvents': 'events',
  'forum.statMessages': 'messages',
  'forum.statActive': 'active forums',
  'forum.browseTitle': 'Explore the forums',
  'forum.filterLabel': 'Filter the forums',
  'forum.filterMine': 'My forums',
  'forum.filterPopular': 'Most active',
  'forum.loadError': 'Forums cannot be loaded right now.',
  'forum.emptyMine':
    'No forum yet. Add favourites or mark your attendance at an event to see some appear here.',
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
  'common.loading': 'Chargement…',
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
  'details.origin': 'Origine',
  'details.origin.directory': 'Répertoire Pulso',
  'details.origin.verified_organizer': 'Organisateur vérifié',
  'details.origin.community': 'Proposé par la communauté',
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
  'groups.missionPlaceholder':
    'À qui s’adresse le groupe et comment souhaitez-vous organiser les sorties ?',
  'groups.typeLegend': 'Quel genre de groupe ?',
  'groups.typeCommunity': 'Communauté',
  'groups.typeCommunityHint':
    'Permanente, autour d’un thème. Ex. Techno Montréal.',
  'groups.typeEvent': 'Sortie',
  'groups.typeEventHint': 'Une soirée précise, à organiser de bout en bout.',
  'groups.typeCrew': 'Crew privé',
  'groups.typeCrewHint': 'Un petit cercle. Invisible dans Découvrir.',
  'groups.joinLegend': 'Comment peut-on rejoindre ?',
  'groups.joinOpen': 'Accès libre',
  'groups.joinOpenHint': 'Visible et accessible immédiatement.',
  'groups.joinRestricted': 'Sur demande',
  'groups.joinRestrictedHint':
    'Visible, mais chaque entrée doit être approuvée.',
  'groups.crewNote': 'Un crew privé se rejoint uniquement sur invitation.',
  'groups.creating': 'Création…',
  'groups.createSubmit': 'Créer le groupe',
  'groups.back': 'Groupes',
  'groups.emptyEyebrow': 'Ton espace collectif',
  'groups.emptyHeading':
    'Organiser une sortie ne devrait jamais être compliqué.',
  'groups.emptyBody':
    'Ouvre un groupe pour retrouver au même endroit les décisions, le programme, les présences, les tâches et la discussion.',
  'groups.emptyCta': 'Créer mon premier groupe',
  'groups.tabMine': 'Mes groupes',
  'groups.tabEvents': 'Événements',
  'groups.tabDiscover': 'Découvrir',
  'groups.searchLabel': 'Rechercher un groupe',
  'groups.loading': 'Chargement…',
  'groups.loadError': 'Impossible de charger les groupes pour le moment.',
  'groups.noMatch': 'Aucun groupe ne correspond à ta recherche.',
  'groups.emptyMine':
    'Aucun groupe pour le moment. Découvre-en un dans l’onglet Découvrir, ou rejoins-en un depuis « Rencontrer avant l’événement » sur un forum.',
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
  'groups.joinOpenPrompt':
    'Rejoins ce groupe pour discuter, voter, et voir le programme.',
  'groups.joinRestrictedPrompt':
    'Ce groupe est à accès limité — ta demande sera envoyée au modérateur.',
  'groups.joining': 'Un instant…',
  'groups.join': 'Rejoindre',
  'groups.askToJoin': 'Demander à rejoindre',
  'groups.pendingRequest':
    'Demande envoyée, en attente d’approbation du modérateur.',
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
  'groups.channelReadOnly':
    'Ce fil est réservé aux annonces de l’administrateur. Tu peux le lire et y réagir.',
  'groups.composerPlaceholder':
    'Partage une idée, une question ou une décision…',
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
  'groups.feedEmptyHint':
    'Une question simple suffit souvent à organiser toute une sortie.',
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
  'groups.manageOpenBody':
    'Les membres le rejoignent sans passer par une demande.',
  // The identity card: the group photo, and the verification a moderator
  // asks for but never grants itself.
  'groups.identityPhotoTitle': 'Photo du groupe',
  'groups.identityPhotoHint': 'Elle apparaît partout où le groupe est listé.',
  'groups.identityPhotoReplace': 'Remplacer',
  'groups.identityPhotoAdd': 'Ajouter une photo',
  'groups.identityPhotoRemove': 'Retirer',
  'groups.identityPhotoFormatError':
    'Format non supporté. Utilise JPEG, PNG, WebP ou GIF.',
  'groups.identityPhotoTooLarge': 'Photo trop lourde.',
  'groups.identityPhotoSaveError': 'La photo n’a pas pu être enregistrée.',
  'groups.identityPhotoRemoveError': 'La photo n’a pas pu être retirée.',
  'groups.verificationHeading': 'Vérification Pulso',
  'groups.verificationVerified':
    'Ce groupe est vérifié. Le badge est visible partout où il apparaît.',
  'groups.verificationPending':
    'Demande envoyée. Une équipe Pulso va l’examiner.',
  'groups.verificationDeclined':
    'La demande précédente n’a pas été retenue. Tu peux en soumettre une nouvelle.',
  'groups.verificationPrompt':
    'Un groupe vérifié inspire confiance aux personnes qui ne le connaissent pas encore.',
  'groups.verificationAsk': 'Demander la vérification',
  'groups.verificationLabel': 'Qui êtes-vous et que fait ce groupe ?',
  'groups.verificationPlaceholder':
    'Ex. Collectif techno actif depuis 2019, 40 soirées par an au Plateau.',
  'groups.verificationCancel': 'Annuler',
  'groups.verificationSending': 'Envoi…',
  'groups.verificationSubmit': 'Envoyer la demande',
  'groups.verificationSendError': 'La demande n’a pas pu être envoyée.',
  // The modules card, and the module registry it lists. These names and
  // descriptions lived in GROUP_MODULE_LABELS, French-only; they are copy
  // the workspace renders, so they belong in the catalogue like the rest.
  'groups.modulesHeading': 'Modules du groupe',
  'groups.modulesHint':
    'Ce que l’onglet Organiser affiche, et dans quel ordre. Désactiver un module le masque sans effacer ce qu’il contient.',
  'groups.modulesSaveError': 'La configuration n’a pas pu être enregistrée.',
  'groups.modulesMoveUp': 'Monter {name}',
  'groups.modulesMoveDown': 'Descendre {name}',
  'groups.modulesUnavailable':
    'Ce groupe n’est lié à aucun événement, donc rien à afficher pour l’instant.',
  'groups.modulesEnabled': 'Activé',
  'groups.modulesHidden': 'Masqué',
  'groups.moduleProgrammeName': 'Programme',
  'groups.moduleProgrammeDescription':
    'Le déroulé de la sortie, heure par heure.',
  'groups.moduleAttendanceName': 'Qui vient ?',
  'groups.moduleAttendanceDescription':
    'Les présences réelles, comptées sur les votes des membres.',
  'groups.moduleMeetupPointName': 'Point de rendez-vous',
  'groups.moduleMeetupPointDescription':
    'Dérivé du lieu réel de l’événement lié. Absent d’un groupe permanent.',
  'groups.moduleChecklistName': 'Checklist',
  'groups.moduleChecklistDescription':
    'Ce que chacun doit préparer, coché individuellement.',
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
  'post.authorYou': 'Vous',
  'post.liked': 'Aimé',
  'post.like': 'J’aime',
  'post.reply': 'Répondre',
  'post.replyCount': '{count} réponse',
  'post.replyCountPlural': '{count} réponses',
  'post.replyPlaceholder': 'Répondre…',
  'post.delete': 'Supprimer',
  'post.report': 'Signaler',
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
  'groups.contextEventBody':
    'Des groupes créés pour préparer une sortie précise.',
  'groups.contextDiscoverTitle': 'Communautés à découvrir',
  'groups.contextDiscoverBody':
    'Des communautés montréalaises ouvertes ou sur demande.',
  // The compact groups block (sidebar mini-list, Profile tab).
  'groups.blockEmpty': 'Aucun groupe pour le moment.',
  'groups.blockOpen': 'Ouvrir',
  // The workspace header chrome. The open-access badge is its own key: the
  // directory says 'Libre' in a tight row, the header spells it out.
  'groups.accessOpenBadge': 'Accès libre',
  'groups.linkedTo': 'Groupe lié à',
  'groups.tabsLabel': 'Espaces du groupe',
  // Shared chrome that is not a group concern: relative timestamps, and
  // the content-report prompt. Both live in apps/web/app/shared.tsx and
  // are called from the map surface as well as the group workspace.
  'time.justNow': 'à l’instant',
  'time.minutesAgo': 'il y a {count} min',
  'time.hoursAgo': 'il y a {count} h',
  'time.daysAgo': 'il y a {count} j',
  'report.prompt': 'Pourquoi signalez-vous ce contenu ? (optionnel)',
  'report.sent': 'Signalement envoyé.',
  // The map surface (explore-map.tsx). Marker pickers open only when two
  // or more pins overlap, so their labels have no singular form.
  'map.eventsHere': '{count} événements à cet endroit',
  'map.venuesHere': '{count} lieux à cet endroit',
  'map.venuesInArea': '{count} lieux dans cette zone',
  'map.eventCount': '{count} événement dans cette zone',
  'map.eventCountPlural': '{count} événements dans cette zone',
  'map.venueCount': '{count} lieu dans cette zone',
  'map.venueCountPlural': '{count} lieux dans cette zone',
  'map.youAreHere': 'Vous êtes ici',
  // The shell's navigation: the desktop top bar and the mobile bottom nav
  // with its Community sheet.
  'nav.events': 'Événements',
  'nav.venues': 'Lieux',
  'nav.community': 'Communauté',
  'nav.messages': 'Messages',
  'nav.forums': 'Forums',
  'nav.groups': 'Groupes',
  'nav.friends': 'Amis',
  'nav.about': 'À propos',
  'nav.notificationsSoon': 'Notifications (bientôt disponible)',
  'nav.comingSoon': 'Bientôt disponible',
  'sidebar.discover': 'Découvrir',
  'sidebar.map': 'Carte',
  'sidebar.favorites': 'Favoris',
  'sidebar.organizer': 'Organisateur',
  'sidebar.administration': 'Administration',
  'profile.tabPhotos': 'Photos',
  'profile.tabFriends': 'Amis',
  'profile.tabFollowedVenues': 'Lieux suivis',
  'profile.followedVenuesEmpty':
    'Aucun lieu suivi pour l’instant. Suis un lieu pour être prévenu de ses prochains événements.',
  'profile.photoChange': 'Changer la photo',
  'profile.photoAdd': 'Ajouter une photo',
  'profile.photoRemove': 'Retirer la photo',
  'profile.photoUploading': 'Envoi en cours…',
  'profile.photoFailed': 'La photo n’a pas pu être envoyée.',
  'profile.galleryAdd': 'Ajouter une photo',
  'profile.galleryEmpty':
    'Aucune photo pour l’instant. Ajoutes-en une pour habiller ton profil.',
  'profile.galleryEmptyOther': 'Aucune photo partagée.',
  'profile.galleryPrivate': 'Cette galerie est visible par les amis seulement.',
  'profile.galleryDelete': 'Supprimer cette photo',
  'profile.galleryCaption': 'Légende (facultatif)',
  'profile.friendsEmpty': 'Aucun ami pour l’instant.',
  'moderation.rejected':
    'Cette image ne peut pas être publiée car elle ne respecte pas les règles de Pulso.',
  'moderation.pending': 'Votre photo est en cours de vérification.',
  'moderation.report': 'Signaler cette photo',
  'moderation.reportSent': 'Merci, cette photo a été signalée.',
  'moderation.reason.sexual': 'Contenu sexuel',
  'moderation.reason.violence': 'Violence',
  'moderation.reason.hate': 'Haine ou contenu offensant',
  'moderation.reason.spam': 'Spam',
  'moderation.reason.inappropriate': 'Photo inappropriée',
  'moderation.reason.other': 'Autre',
  'admin.moderation.title': 'Modération des images',
  'admin.moderation.empty': 'Aucune image en attente de décision.',
  'admin.moderation.approve': 'Approuver',
  'admin.moderation.remove': 'Retirer',
  'admin.moderation.reports': '{count} signalement(s)',
  'admin.moderation.automatic': 'Verdict automatique',
  'friends.theirPhotos': 'Ses moments',
  'friends.writeTo': 'Écrire un message',
  'dock.title': 'Messages',
  'dock.open': 'Ouvrir les messages',
  'dock.close': 'Fermer les messages',
  'dock.back': 'Retour aux conversations',
  'dock.empty': 'Aucune conversation pour l’instant.',
  'dock.compose': 'Écrire un message…',
  'dock.send': 'Envoyer',
  'dock.requests': 'Demandes',
  'dock.requestsEmpty': 'Aucune demande de message.',
  'dock.accept': 'Accepter',
  'dock.decline': 'Refuser',
  'dock.conversations': 'Conversations',
  'dock.seeAll': 'Ouvrir la messagerie complète',
  'dock.sendFailed': 'Le message n’a pas pu être envoyé.',
  'view.map': 'Carte',
  'view.list': 'Liste',
  'view.calendar': 'Calendrier',
  // The sidebar filter panel, on top of the filters.* keys the overlay
  // already uses.
  'filters.reset': 'Réinitialiser',
  'filters.date': 'Date',
  'filters.categoryLegendHint':
    'La couleur de chaque catégorie correspond à celle des pins sur la carte.',
  'filters.venueCategory': 'Catégorie de lieu',
  'filters.venueDateHint':
    'Affiche les lieux ayant un événement dans cette période.',
  'filters.radiusActive': 'Rayon actif : {km} km',
  'filters.radiusMax': 'Rayon max ({km} km) — non appliqué',
  'filters.geoPending': 'localisation…',
  'filters.geoDenied': 'position non partagée',
  'filters.geoUnsupported': 'non disponible sur cet appareil',
  'filters.showAllEvents': 'Afficher tous les événements',
  'filters.showFavoritesOnly': 'Afficher uniquement mes favoris',
  'filters.showAllVenues': 'Afficher tous les lieux',
  'filters.showFollowedVenuesOnly': 'Afficher uniquement mes lieux suivis',
  'filters.followedVenues': 'Lieux suivis',
  // The map's own chrome: recentre controls, the pin-kind toggles and the
  // legend. 'Montréal' itself is a proper noun and stays as written.
  'map.recenterShort': 'Recentrer',
  'map.recenterMontreal': 'Recentrer sur Montréal',
  'map.exploreMontreal': 'Explorer Montréal',
  'map.explorePeriod': 'Période d’exploration',
  'map.pinAll': 'Tout',
  'map.legend': 'Légende',
  'map.legendMarkers': 'Repères',
  'map.legendEvent': 'Événement programmé',
  'map.legendVenue': 'Lieu récurrent',
  'map.markerCount': '{count} repère',
  'map.markerCountPlural': '{count} repères',
  // The mobile-app promo card in the sidebar.
  'promo.downloadTitle': 'Téléchargez Pulso',
  'promo.downloadBody': 'Emportez la ville dans votre poche.',
  'promo.comingSoonOn': 'Bientôt sur',
  // The signed-out landing: the nearby carousel and the four feature cards
  // under it.
  'landing.nearbyTitle': 'Événements autour de vous',
  'landing.nearbyListTitle': 'Événements les plus proches de vous',
  'landing.seeAllEvents': 'Voir tous les événements',
  'landing.noEvents': 'Aucun événement trouvé.',
  'landing.featureMapTitle': 'Carte intelligente',
  'landing.featureMapBody':
    'Explorez votre ville et découvrez des événements autour de vous en temps réel.',
  'landing.featureSearchTitle': 'Recherche puissante',
  'landing.featureSearchBody':
    'Trouvez exactement ce que vous cherchez grâce à la recherche et à nos suggestions.',
  'landing.featureFavoritesTitle': 'Vos favoris',
  'landing.featureFavoritesBody':
    'Sauvegardez vos événements préférés et ne manquez jamais une sortie.',
  'landing.featureCommunityTitle': 'Communauté',
  'landing.featureCommunityBody':
    'Rejoignez des milliers de passionnés et partagez vos meilleures découvertes.',
  // The notification feed. Each row is a sentence built around one or two
  // bold names, and every one of these keeps the same word order in both
  // languages - which is what lets them be keyed as fragments.
  'notif.title': 'Notifications',
  'notif.close': 'Fermer',
  'notif.unread': 'Non lu',
  'notif.loadError': 'Impossible de charger tes notifications.',
  'notif.emptyTitle': 'Rien de neuf',
  'notif.emptyBody':
    'Suis un lieu pour être prévenu·e dès qu’il programme quelque chose.',
  'notif.venueAdded': 'vient d’ajouter',
  'notif.friendRequest': 't’a envoyé une demande d’ami',
  'notif.friendAccepted': 'a accepté ta demande d’ami',
  'notif.messageReceived': 't’a envoyé un message',
  'notif.forumReply': 'a écrit dans le forum de',
  'notif.organizerRequest': 'demande à gérer',
  'notif.organizerApproved': 'Tu es organisateur vérifié de',
  'notif.requestFor': 'Ta demande pour',
  'notif.declined': 'n’a pas été retenue',
  'notif.groupVerificationRequest': 'demande la vérification de',
  'notif.groupVerified': 'est maintenant un groupe vérifié',
  'notif.groupVerificationOf': 'La vérification de',
  'notif.groupJoinRequest': 'demande à rejoindre',
  'notif.groupJoined': 'Tu as rejoint',
  'notif.eventStartsSoon': 'commence bientôt à',
  'event.noUpcoming': 'Aucun événement prévu pour le moment',
  'event.upcomingCount': '{count} événement à venir',
  'event.upcomingCountPlural': '{count} événements à venir',
  // The event forum: its panel, its four rooms, and the discovery cards
  // that lead into it.
  'forum.panelLabel': 'Forum de l’événement',
  'forum.meetupCta': 'Rencontrer avant l’événement',
  'forum.meetupLoading': 'Un instant…',
  'forum.signInDiscussion':
    'Connectez-vous pour lire et participer au forum de cet événement.',
  'forum.signInPhotos':
    'Connectez-vous pour voir et partager des photos de cet événement.',
  'forum.emptyDiscussion':
    'Personne n’a encore écrit ici. Lance la discussion dans l’onglet Discussion !',
  'forum.membersLoadError': 'Impossible de charger les membres pour le moment.',
  'forum.attendanceGoing': '✓ Vous y allez',
  'forum.attendanceGo': '🎟️ J’y vais',
  'forum.empty': 'Personne n’a encore écrit ici.',
  'forum.aboutEvent': 'À propos de l’événement',
  'forum.seeEvent': 'Voir l’événement',
  'forum.rulesTitle': 'Règles du forum',
  'forum.ruleNoSpam': 'Pas de spam ni de publicité',
  'forum.ruleResale': 'Revente de billets uniquement pair-à-pair',
  'forum.ruleOnTopic': 'Reste sur le sujet de l’événement',
  'forum.aboutSpaceTitle': 'Un espace pour cet événement',
  'forum.aboutSpaceBody':
    'Discutez de « {title} », posez vos questions et trouvez des partenaires pour la soirée.',
  'forum.aboutOnceTitle': 'Un message, une fois',
  'forum.aboutOnceBody':
    'Un message publié n’est pas modifiable après coup — seulement supprimable par son auteur.',
  'forum.aboutResaleTitle': 'Revente entre particuliers',
  'forum.aboutResaleBody':
    'La revente de billets entre participants reste entièrement pair-à-pair — Pulso n’y est jamais partie prenante.',
  'forum.aboutReportTitle': 'Signalement',
  'forum.aboutReportBody':
    'Chaque message peut être signalé. Restez courtois·e envers les autres participants.',
  'forum.photoUploadError':
    'L’envoi a échoué. Réessayez avec une photo JPEG, PNG, WebP ou GIF.',
  'forum.photosEmpty': 'Aucune photo pour l’instant. Partage la première !',
  'forum.agoraEyebrow': 'L’agora de l’événement',
  'forum.agoraBody':
    'Quatre salons, un seul événement : va directement vers la conversation qui t’intéresse.',
  'forum.roomSelected': 'Salon sélectionné',
  'forum.resaleDisclaimer': 'Échange entre particuliers uniquement.',
  'forum.resaleDisclaimerBody':
    'Pulso n’intervient pas dans la transaction : aucun paiement ni billet ne transite par la plateforme.',
  'forum.writeInRoom': 'Écrire dans le salon {room}',
  'forum.discoverActive': 'Discussion active',
  'forum.discoverToStart': 'À lancer',
  'forum.discoverStartFirst':
    'Lance la première discussion pour cet événement.',
  'forum.discoverTitle': 'Discussion à découvrir',
  'forum.discoverOpen':
    'La conversation est ouverte. Sois la première personne à lancer le sujet.',
  'forum.communityTitle': 'La communauté Pulso · Montréal',
  'forum.communityBody':
    'Trouve avec qui y aller, échange les bons plans et retrouve les personnes qui font vivre chaque événement.',
  'forum.perEvent': 'par événement',
  'forum.yourChoice': 'à toi de choisir',
  'forum.oneDiscussionPerEvent':
    'Une discussion dédiée à chaque événement à venir.',
  'forum.noUpcomingEvents': 'Aucun événement à venir pour le moment.',
  // The four forum rooms. Their names came from FORUM_CATEGORY_LABELS in
  // the domain package and the rest from FORUM_ROOM_PRESENTATION here,
  // both French-only; the icons stay in the component.
  'forum.roomGeneral': 'Discussion générale',
  'forum.roomGeneralDescription':
    'Questions, conseils et impressions autour de la sortie.',
  'forum.roomGeneralPlaceholder': 'Pose une question ou partage un bon plan…',
  'forum.roomGeneralEmpty':
    'Pose la première question ou partage ton conseil sur la soirée.',
  'forum.roomPartners': 'Trouver des partenaires',
  'forum.roomPartnersDescription':
    'Présente-toi et trouve des personnes avec qui y aller.',
  'forum.roomPartnersPlaceholder':
    'Dis qui tu es et avec qui tu aimerais y aller…',
  'forum.roomPartnersEmpty':
    'Présente-toi et propose un point de rendez-vous avant l’événement.',
  'forum.roomResale': 'Revente de place',
  'forum.roomResaleDescription':
    'Propositions de billets entre membres de la communauté.',
  'forum.roomResalePlaceholder':
    'Décris clairement le billet que tu proposes ou recherches…',
  'forum.roomResaleEmpty':
    'Indique le type de billet recherché ou proposé, sans partager de données sensibles.',
  'forum.roomFindSomeone': 'Retrouver quelqu’un qui était là',
  'forum.roomFindSomeoneDescription':
    'Retrouve une personne croisée pendant l’événement.',
  'forum.roomFindSomeonePlaceholder':
    'Décris le contexte de votre rencontre avec respect…',
  'forum.roomFindSomeoneEmpty':
    'Décris sobrement le moment et le lieu de la rencontre pour lancer la recherche.',
  // The forum panel's five tabs.
  'forum.tabDiscussion': 'Discussion',
  'forum.tabEvent': 'Événement',
  'forum.tabMembers': 'Membres',
  'forum.tabPhotos': 'Photos',
  'forum.tabAbout': 'À propos',
  // EventForum's own chrome.
  'forum.chooseSpace': 'Choisis ton espace de discussion',
  'forum.roomsLabel': 'Salons du forum',
  'forum.messageCount': '{count} message',
  'forum.messageCountPlural': '{count} messages',
  'forum.messageWord': 'message',
  'forum.messageWordPlural': 'messages',
  'forum.posting': 'Publication…',
  'forum.post': 'Publier',
  'forum.photoUploading': 'Envoi en cours…',
  'forum.photoAdd': '📷 Ajouter une photo',
  'forum.photosLoadError': 'Impossible de charger les photos pour le moment.',
  'forum.photoDelete': 'Supprimer cette photo',
  'forum.participantCount': '{count} participant',
  'forum.participantCountPlural': '{count} participants',
  'forum.participantWord': 'participant',
  'forum.participantWordPlural': 'participants',
  'forum.openSpotlight': 'Ouvrir la discussion mise en avant pour {title}',
  'forum.enterDiscussion': 'Entrer dans la discussion',
  // Messages: the inbox, its tabs and its empty states.
  'messages.title': 'Messages',
  'messages.eyebrow': 'Ton cercle Pulso',
  'messages.tagline': 'Prépare vos prochaines sorties, simplement.',
  'messages.compose': 'Nouveau message',
  'messages.write': 'Écrire',
  'messages.conversationWord': 'conversation',
  'messages.conversationWordPlural': 'conversations',
  'messages.unreadWord': 'non lu',
  'messages.unreadWordPlural': 'non lus',
  'messages.tabDiscussions': 'Discussions',
  'messages.tabRequests': 'Demandes',
  'messages.tabGroups': 'Groupes',
  'messages.search': 'Rechercher une conversation',
  'messages.loadError': 'Impossible de charger vos messages pour le moment.',
  'messages.readyTitle': 'Ton espace de discussion est prêt.',
  'messages.readyBody': 'Ajoute des amis, puis lance la première conversation.',
  'messages.noResult': 'Aucun résultat.',
  'messages.privateEyebrow': 'Conversations privées',
  'messages.privateTitle':
    'Les meilleures sorties commencent souvent par un message.',
  'messages.privateBody':
    'Choisis un ami ou un groupe pour planifier, partager un événement et décider ensemble.',
  'messages.writeToFriend': 'Écrire à un ami',
  'messages.privateConversation': 'Conversation privée',
  'messages.canExchange': 'Vous pouvez échanger car vous êtes amis sur Pulso.',
  'messages.betweenFriends': 'Entre amis',
  'messages.newConnections': 'Nouvelles connexions',
  'messages.friendRequests': 'Demandes d’amis',
  'messages.requestsHint':
    'Une fois acceptée, une conversation privée peut commencer.',
  'messages.requestsLoadError':
    'Impossible de charger vos demandes pour le moment.',
  'messages.allUpToDate': 'Tout est à jour.',
  'messages.noPendingRequests': 'Aucune demande en attente pour le moment.',
  'messages.toConfirm': 'À confirmer',
  'messages.sent': 'Envoyées',
  'messages.accept': 'Accepter',
  'messages.decline': 'Refuser',
  'messages.composeHint':
    'Choisis un ami pour commencer ou reprendre un échange.',
  'messages.friendsLoadError': 'Impossible de charger vos amis pour le moment.',
  'messages.noFriendsToWrite': 'Ajoute des amis pour pouvoir leur écrire.',
  // The friends page, the friend panel and the two invite modals.
  'friends.title': 'Mes amis',
  'friends.eyebrow': 'Ton cercle Pulso',
  'friends.tagline': 'Retrouve les personnes avec qui vivre Montréal.',
  'friends.invite': 'Inviter un ami',
  'friends.circleSummary': 'Résumé de ton cercle',
  'friends.friendsWord': 'amis',
  'friends.havePlans': 'ont une sortie visible',
  'friends.requestWord': 'demande',
  'friends.requestWordPlural': 'demandes',
  'friends.search': 'Rechercher un ami',
  'friends.tabCircle': 'Mon cercle',
  'friends.tabRequests': 'Demandes',
  'friends.tabSuggestions': 'Suggestions',
  'friends.tabDiscover': 'À découvrir',
  'friends.noFriendsYet': 'Aucun ami pour le moment',
  'friends.shareCodeHint': 'Partage ton code pour commencer à te connecter.',
  'friends.messageShort': 'Message',
  'friends.removeShort': 'Retirer',
  'friends.confirmRemove': 'Retirer cette personne de tes amis ?',
  'friends.loadError': 'Impossible de charger vos amis pour le moment.',
  'friends.inCircle': 'Dans ton cercle',
  'friends.sendMessage': 'Envoyer un message',
  'friends.removeFriend': 'Retirer cet ami',
  'friends.noRequests': 'Aucune demande d’ami pour le moment.',
  'friends.noSuggestions':
    'Pas de suggestion pour l’instant - ajoute des amis pour en découvrir de nouveaux via vos connexions en commun.',
  'friends.panelHint':
    'Consulte ses sorties partagées, vos événements en commun et démarre l’organisation de votre prochaine soirée.',
  'friends.inviteNewPerson': 'Inviter une nouvelle personne',
  'friends.upcomingWithCircle': 'à venir avec leur cercle.',
  'friends.sharedOutingsHint':
    'Les sorties que tes amis partagent apparaîtront ici.',
  'friends.goingTo': 'Va à {title}',
  'friends.mutualCount': '{count} ami en commun',
  'friends.mutualCountPlural': '{count} amis en commun',
  'friends.noBio': 'Aucune bio partagée pour le moment.',
  'friends.noCommonEvents': 'Aucun événement en commun pour l’instant.',
  'friends.nothingToShow': 'Rien à afficher pour l’instant.',
  'friends.markAttendanceFirst':
    'Marque ta présence sur un événement pour pouvoir l’inviter.',
  'friends.inviteSent': 'Envoyé ✓',
  'friends.inviteError': 'Impossible d’envoyer la demande pour le moment.',
  'friends.copied': 'Copié !',
  'friends.pasteCode': 'Coller le code d’un ami pour l’ajouter',
  'friends.codeToAdd': 'Code ami à ajouter',
  'friends.noSharedOutings':
    'Aucun ami n’a de sortie à venir partagée pour l’instant.',
  'friends.conversationError': 'Impossible de charger la conversation.',
  'friends.conversationHint':
    'Un événement à partager ou une sortie à préparer ? Écris le premier message.',
  'friends.requestsSent': 'Demandes envoyées',
  'friends.pending': 'En attente',
  'friends.add': '+ Ajouter',
  'friends.circleWaiting': 'Ton cercle t’attend',
  'friends.pickAFriend': 'Choisis un ami',
  'friends.circleMoving': 'Ton cercle bouge',
  'friends.sharedOutingOne':
    'ami a partagé une sortie à venir avec leur cercle.',
  'friends.sharedOutingMany':
    'amis ont partagé une sortie à venir avec leur cercle.',
  'friends.seeOnMap': 'Voir sur la carte',
  'friends.upcoming': 'À venir',
  'friends.circleOutings': 'Sorties du cercle',
  'friends.yourMeetups': 'Vos rendez-vous',
  'friends.commonEvents': 'Événements en commun',
  'friends.sharedHistory': 'Historique partagé',
  'friends.recentActivity': 'Activité récente',
  'forum.heroTitle': 'Les discussions qui donnent envie de sortir.',
  'forum.heroCta': 'Explorer les discussions',
  'forum.roomsAvailable': 'Salons disponibles',
  'forum.orbitForum': 'Forum',
  'forum.orbitDiscussion': 'Discussion',
  'forum.orbitTogether': 'Sortir ensemble',
  'forum.orbitTickets': 'Billets',
  'forum.orbitFindEachOther': 'Se retrouver',
  'forum.statEvents': 'événements',
  'forum.statMessages': 'messages',
  'forum.statActive': 'forums actifs',
  'forum.browseTitle': 'Explore les forums',
  'forum.filterLabel': 'Filtrer les forums',
  'forum.filterMine': 'Mes forums',
  'forum.filterPopular': 'Les plus actifs',
  'forum.loadError': 'Impossible de charger les forums pour le moment.',
  'forum.emptyMine':
    'Aucun forum pour l’instant. Ajoute des favoris ou marque ta participation à un événement pour en voir apparaître ici.',
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

/**
 * Picks between a singular and a plural catalogue key using the locale's
 * real plural rule, and interpolates {count}.
 *
 * The two languages disagree about zero: French takes the singular ("0
 * événement"), English the plural ("0 events"). Callers used to hardcode
 * one side of that - `count > 1` in the map's result counter, `count === 1`
 * in the group member and reply counters - so whichever language was not
 * being looked at got it wrong. Intl.PluralRules knows the rule for both.
 */
export function translatePlural(
  locale: SupportedLocale,
  count: number,
  one: MessageKey,
  other: MessageKey,
  params: Record<string, string | number> = {}
): string {
  const form = new Intl.PluralRules(displayLocale(locale)).select(count);
  return translate(locale, form === 'one' ? one : other, {
    count,
    ...params
  });
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
