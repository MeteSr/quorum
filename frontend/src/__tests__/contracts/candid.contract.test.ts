/**
 * @jest-environment node
 */
// Candid contract tests — verify IDL factories match the deployed Motoko signatures.
// Run: npx vitest run src/__tests__/contracts/candid.contract.test.ts

import { IDL } from "@dfinity/candid";
import { idlFactory as membersIdl }       from "../../services/members";
import { idlFactory as governanceIdl }    from "../../services/governance";
import { idlFactory as treasuryIdl }      from "../../services/treasury";
import { idlFactory as documentsIdl }     from "../../services/documents";
import { idlFactory as announcementsIdl } from "../../services/announcements";
import { idlFactory as maintenanceIdl }   from "../../services/maintenance";
import { idlFactory as violationsIdl }    from "../../services/violations";
import { idlFactory as meetingsIdl }      from "../../services/meetings";
import { idlFactory as calendarIdl }      from "../../services/calendar";
import { idlFactory as arcIdl }           from "../../services/arc";
import { idlFactory as parkingIdl }       from "../../services/parking";
import { idlFactory as vendorsIdl }       from "../../services/vendors";
import { idlFactory as discussionsIdl }  from "../../services/discussions";

// ─── helpers ─────────────────────────────────────────────────────────────────

function extractService(factory: (args: { IDL: typeof IDL }) => IDL.ServiceClass) {
  const svc = factory({ IDL });
  const methods = new Map<string, { isQuery: boolean; argTypes: IDL.Type[]; retTypes: IDL.Type[] }>();
  // _fields is [string, FuncClass][]
  for (const [name, func] of (svc as any)._fields as [string, IDL.FuncClass][]) {
    methods.set(name, {
      isQuery:  (func.annotations ?? []).includes("query"),
      argTypes: func.argTypes,
      retTypes: func.retTypes,
    });
  }
  return methods;
}

// ─── Members ─────────────────────────────────────────────────────────────────

describe("members IDL factory", () => {
  let methods: ReturnType<typeof extractService>;
  beforeAll(() => { methods = extractService(membersIdl); });

  test("exposes all expected methods", () => {
    const expected = [
      "assignRole",
      "deactivateMember",
      "generateInviteCode",
      "getActiveMembers",
      "getAllMembers",
      "getCommunityProfile",
      "getInviteCode",
      "getMember",
      "getMyProfile",
      "initAdmin",
      "isBoardMember",
      "registerMember",
      "revokeInviteCode",
      "setCommunityProfile",
    ];
    expect([...methods.keys()].sort()).toEqual(expected);
  });

  test("registerMember is an update call", () => {
    expect(methods.get("registerMember")!.isQuery).toBe(false);
  });

  test("getAllMembers is a query", () => {
    expect(methods.get("getAllMembers")!.isQuery).toBe(true);
  });

  test("getCommunityProfile is a query", () => {
    expect(methods.get("getCommunityProfile")!.isQuery).toBe(true);
  });

  test("generateInviteCode is an update call", () => {
    expect(methods.get("generateInviteCode")!.isQuery).toBe(false);
  });

  test("registerMember takes 4 args", () => {
    expect(methods.get("registerMember")!.argTypes).toHaveLength(4);
  });
});

// ─── Governance ──────────────────────────────────────────────────────────────

describe("governance IDL factory", () => {
  let methods: ReturnType<typeof extractService>;
  beforeAll(() => { methods = extractService(governanceIdl); });

  test("exposes all expected methods", () => {
    const expected = [
      "castPollVote",
      "castVote",
      "closePoll",
      "createPoll",
      "createProposal",
      "finalizeProposal",
      "getAllPolls",
      "getAllProposals",
      "getMyVote",
      "getOpenPolls",
      "getOpenProposals",
      "getPoll",
      "getProposal",
      "openProposal",
      "setMembersCanisterId",
    ];
    expect([...methods.keys()].sort()).toEqual(expected);
  });

  test("createProposal is an update call", () => {
    expect(methods.get("createProposal")!.isQuery).toBe(false);
  });

  test("getAllProposals is a query", () => {
    expect(methods.get("getAllProposals")!.isQuery).toBe(true);
  });

  test("castVote is an update call", () => {
    expect(methods.get("castVote")!.isQuery).toBe(false);
  });

  test("getMyVote is a query with 2 args", () => {
    const m = methods.get("getMyVote")!;
    expect(m.isQuery).toBe(true);
    expect(m.argTypes).toHaveLength(2);
  });

  test("createPoll is an update call with 5 args", () => {
    const m = methods.get("createPoll")!;
    expect(m.isQuery).toBe(false);
    expect(m.argTypes).toHaveLength(5);
  });

  test("castPollVote is an update call with 2 args", () => {
    const m = methods.get("castPollVote")!;
    expect(m.isQuery).toBe(false);
    expect(m.argTypes).toHaveLength(2);
  });

  test("getOpenPolls is a query", () => {
    expect(methods.get("getOpenPolls")!.isQuery).toBe(true);
  });

  test("closePoll is an update call", () => {
    expect(methods.get("closePoll")!.isQuery).toBe(false);
  });
});

// ─── Treasury ─────────────────────────────────────────────────────────────────

describe("treasury IDL factory", () => {
  let methods: ReturnType<typeof extractService>;
  beforeAll(() => { methods = extractService(treasuryIdl); });

  test("exposes all expected methods", () => {
    const expected = [
      "configureStripe",
      "createDuesCheckoutSession",
      "getAssessment",
      "getAssessmentsForUnit",
      "getLateFeePolicy",
      "getOutstandingAssessments",
      "getPaymentHistory",
      "getReminderLog",
      "getReminderPolicy",
      "getTotalOutstandingCents",
      "markPaid",
      "metrics",
      "postAssessment",
      "setLateFeePolicy",
      "setMembersCanisterId",
      "setReminderPolicy",
      "transform",
      "verifyDuesSession",
      "waiveAssessment",
      "waiveLateFee",
    ];
    expect([...methods.keys()].sort()).toEqual(expected);
  });

  test("postAssessment is an update call", () => {
    expect(methods.get("postAssessment")!.isQuery).toBe(false);
  });

  test("getTotalOutstandingCents is a query", () => {
    expect(methods.get("getTotalOutstandingCents")!.isQuery).toBe(true);
  });

  test("getAssessmentsForUnit is a query with 1 arg", () => {
    const m = methods.get("getAssessmentsForUnit")!;
    expect(m.isQuery).toBe(true);
    expect(m.argTypes).toHaveLength(1);
  });
});

// ─── Documents ────────────────────────────────────────────────────────────────

describe("documents IDL factory", () => {
  let methods: ReturnType<typeof extractService>;
  beforeAll(() => { methods = extractService(documentsIdl); });

  test("exposes all expected methods", () => {
    const expected = [
      "acknowledgeDocument",
      "deleteDocument",
      "getAcknowledgmentStatus",
      "getAllDocumentsMeta",
      "getAllPublicDocumentsMeta",
      "getDocument",
      "getDocumentMeta",
      "getDocumentsByCategory",
      "getMyAcknowledgedDocs",
      "setRequiresAcknowledgment",
      "uploadDocument",
    ];
    expect([...methods.keys()].sort()).toEqual(expected);
  });

  test("uploadDocument is an update call", () => {
    expect(methods.get("uploadDocument")!.isQuery).toBe(false);
  });

  test("getAllDocumentsMeta is a query", () => {
    expect(methods.get("getAllDocumentsMeta")!.isQuery).toBe(true);
  });

  test("deleteDocument is an update call", () => {
    expect(methods.get("deleteDocument")!.isQuery).toBe(false);
  });

  test("uploadDocument takes 6 args", () => {
    expect(methods.get("uploadDocument")!.argTypes).toHaveLength(6);
  });

  test("acknowledgeDocument is an update call with 1 arg", () => {
    const m = methods.get("acknowledgeDocument")!;
    expect(m.isQuery).toBe(false);
    expect(m.argTypes).toHaveLength(1);
  });

  test("getAcknowledgmentStatus is a query with 1 arg", () => {
    const m = methods.get("getAcknowledgmentStatus")!;
    expect(m.isQuery).toBe(true);
    expect(m.argTypes).toHaveLength(1);
  });

  test("setRequiresAcknowledgment is an update call with 2 args", () => {
    const m = methods.get("setRequiresAcknowledgment")!;
    expect(m.isQuery).toBe(false);
    expect(m.argTypes).toHaveLength(2);
  });

  test("getMyAcknowledgedDocs is a query", () => {
    expect(methods.get("getMyAcknowledgedDocs")!.isQuery).toBe(true);
  });
});

// ─── Announcements ────────────────────────────────────────────────────────────

describe("announcements IDL factory", () => {
  let methods: ReturnType<typeof extractService>;
  beforeAll(() => { methods = extractService(announcementsIdl); });

  test("exposes all expected methods", () => {
    const expected = [
      "broadcastEmergency",
      "delete",
      "getActive",
      "getAll",
      "getAnnouncement",
      "getBroadcasts",
      "getRecentBroadcasts",
      "getUrgent",
      "post",
    ];
    expect([...methods.keys()].sort()).toEqual(expected);
  });

  test("post is an update call", () => {
    expect(methods.get("post")!.isQuery).toBe(false);
  });

  test("getActive is a query", () => {
    expect(methods.get("getActive")!.isQuery).toBe(true);
  });

  test("delete is an update call", () => {
    expect(methods.get("delete")!.isQuery).toBe(false);
  });

  test("post takes 4 args", () => {
    expect(methods.get("post")!.argTypes).toHaveLength(4);
  });

  test("broadcastEmergency is an update call with 3 args", () => {
    const m = methods.get("broadcastEmergency")!;
    expect(m.isQuery).toBe(false);
    expect(m.argTypes).toHaveLength(3);
  });

  test("getBroadcasts is a query", () => {
    expect(methods.get("getBroadcasts")!.isQuery).toBe(true);
  });

  test("getRecentBroadcasts is a query with 1 arg", () => {
    const m = methods.get("getRecentBroadcasts")!;
    expect(m.isQuery).toBe(true);
    expect(m.argTypes).toHaveLength(1);
  });
});

// ─── Maintenance ──────────────────────────────────────────────────────────────

describe("maintenance IDL factory", () => {
  let methods: ReturnType<typeof extractService>;
  beforeAll(() => { methods = extractService(maintenanceIdl); });

  test("exposes all expected methods", () => {
    const expected = [
      "assignRequest",
      "getAllRequests",
      "getMyRequests",
      "getOpenRequests",
      "getRequest",
      "getRequestsForUnit",
      "setMembersCanisterId",
      "submitRequest",
      "updateStatus",
    ];
    expect([...methods.keys()].sort()).toEqual(expected);
  });

  test("submitRequest is an update call", () => {
    expect(methods.get("submitRequest")!.isQuery).toBe(false);
  });

  test("submitRequest takes 4 args", () => {
    expect(methods.get("submitRequest")!.argTypes).toHaveLength(4);
  });

  test("assignRequest is an update call", () => {
    expect(methods.get("assignRequest")!.isQuery).toBe(false);
  });

  test("assignRequest takes 3 args", () => {
    expect(methods.get("assignRequest")!.argTypes).toHaveLength(3);
  });

  test("updateStatus is an update call", () => {
    expect(methods.get("updateStatus")!.isQuery).toBe(false);
  });

  test("updateStatus takes 3 args", () => {
    expect(methods.get("updateStatus")!.argTypes).toHaveLength(3);
  });

  test("getMyRequests is a query", () => {
    expect(methods.get("getMyRequests")!.isQuery).toBe(true);
  });

  test("getAllRequests is a query", () => {
    expect(methods.get("getAllRequests")!.isQuery).toBe(true);
  });

  test("getOpenRequests is a query", () => {
    expect(methods.get("getOpenRequests")!.isQuery).toBe(true);
  });

  test("getRequestsForUnit is a query with 1 arg", () => {
    const m = methods.get("getRequestsForUnit")!;
    expect(m.isQuery).toBe(true);
    expect(m.argTypes).toHaveLength(1);
  });
});

// ─── Violations ───────────────────────────────────────────────────────────────

describe("violations IDL factory", () => {
  let methods: ReturnType<typeof extractService>;
  beforeAll(() => { methods = extractService(violationsIdl); });

  test("exposes all expected methods", () => {
    const expected = [
      "addReply",
      "createViolation",
      "getAllViolations",
      "getMyViolations",
      "getViolation",
      "getViolationsForUnit",
      "updateStatus",
    ];
    expect([...methods.keys()].sort()).toEqual(expected);
  });

  test("createViolation is an update call", () => {
    expect(methods.get("createViolation")!.isQuery).toBe(false);
  });

  test("getAllViolations is a query", () => {
    expect(methods.get("getAllViolations")!.isQuery).toBe(true);
  });

  test("addReply is an update call", () => {
    expect(methods.get("addReply")!.isQuery).toBe(false);
  });

  test("updateStatus is an update call", () => {
    expect(methods.get("updateStatus")!.isQuery).toBe(false);
  });

  test("createViolation takes 4 args", () => {
    expect(methods.get("createViolation")!.argTypes).toHaveLength(4);
  });

  test("getViolationsForUnit is a query with 1 arg", () => {
    const m = methods.get("getViolationsForUnit")!;
    expect(m.isQuery).toBe(true);
    expect(m.argTypes).toHaveLength(1);
  });
});

// ─── Meetings ────────────────────────────────────────────────────────────────

describe("meetings IDL factory", () => {
  let methods: ReturnType<typeof extractService>;
  beforeAll(() => { methods = extractService(meetingsIdl); });

  test("exposes all expected methods", () => {
    const expected = [
      "addAgendaItem",
      "addMotion",
      "createMeeting",
      "generateMinutes",
      "getAllMeetings",
      "getMeeting",
      "recordAttendance",
      "setCalendarCanisterId",
      "setDocumentsCanisterId",
    ];
    expect([...methods.keys()].sort()).toEqual(expected);
  });

  test("createMeeting is an update call", () => {
    expect(methods.get("createMeeting")!.isQuery).toBe(false);
  });

  test("getMeeting is a query", () => {
    expect(methods.get("getMeeting")!.isQuery).toBe(true);
  });

  test("getAllMeetings is a query", () => {
    expect(methods.get("getAllMeetings")!.isQuery).toBe(true);
  });

  test("generateMinutes is an update call", () => {
    expect(methods.get("generateMinutes")!.isQuery).toBe(false);
  });

  test("createMeeting takes 3 args (date, type, agendaItems)", () => {
    expect(methods.get("createMeeting")!.argTypes).toHaveLength(3);
  });

  test("addAgendaItem takes 4 args", () => {
    expect(methods.get("addAgendaItem")!.argTypes).toHaveLength(4);
  });

  test("addMotion takes 7 args", () => {
    expect(methods.get("addMotion")!.argTypes).toHaveLength(7);
  });
});

// ─── Calendar ────────────────────────────────────────────────────────────────

describe("calendar IDL factory", () => {
  let methods: ReturnType<typeof extractService>;
  beforeAll(() => { methods = extractService(calendarIdl); });

  test("exposes all expected methods", () => {
    const expected = [
      "createEvent",
      "deleteEvent",
      "getEvent",
      "getUpcomingEvents",
      "http_request",
      "listEvents",
      "setMeetingsCanisterId",
    ];
    expect([...methods.keys()].sort()).toEqual(expected);
  });

  test("createEvent is an update call", () => {
    expect(methods.get("createEvent")!.isQuery).toBe(false);
  });

  test("deleteEvent is an update call", () => {
    expect(methods.get("deleteEvent")!.isQuery).toBe(false);
  });

  test("getEvent is a query", () => {
    expect(methods.get("getEvent")!.isQuery).toBe(true);
  });

  test("listEvents is a query", () => {
    expect(methods.get("listEvents")!.isQuery).toBe(true);
  });

  test("http_request is a query", () => {
    expect(methods.get("http_request")!.isQuery).toBe(true);
  });

  test("createEvent takes 6 args", () => {
    expect(methods.get("createEvent")!.argTypes).toHaveLength(6);
  });

  test("listEvents takes 2 args (startAt, endAt)", () => {
    expect(methods.get("listEvents")!.argTypes).toHaveLength(2);
  });
});

// ─── ARC ─────────────────────────────────────────────────────────────────────

describe("arc IDL factory", () => {
  let methods: ReturnType<typeof extractService>;
  beforeAll(() => { methods = extractService(arcIdl); });

  test("exposes all expected methods", () => {
    const expected = [
      "getAllRequests",
      "getMyRequests",
      "getRequest",
      "getRequestsForUnit",
      "submitRequest",
      "updateStatus",
    ];
    expect([...methods.keys()].sort()).toEqual(expected);
  });

  test("submitRequest is an update call", () => {
    expect(methods.get("submitRequest")!.isQuery).toBe(false);
  });

  test("updateStatus is an update call", () => {
    expect(methods.get("updateStatus")!.isQuery).toBe(false);
  });

  test("getRequest is a query", () => {
    expect(methods.get("getRequest")!.isQuery).toBe(true);
  });

  test("getAllRequests is a query", () => {
    expect(methods.get("getAllRequests")!.isQuery).toBe(true);
  });

  test("submitRequest takes 4 args", () => {
    expect(methods.get("submitRequest")!.argTypes).toHaveLength(4);
  });

  test("updateStatus takes 3 args", () => {
    expect(methods.get("updateStatus")!.argTypes).toHaveLength(3);
  });
});

// ─── Parking ─────────────────────────────────────────────────────────────────

describe("parking IDL factory", () => {
  let methods: ReturnType<typeof extractService>;
  beforeAll(() => { methods = extractService(parkingIdl); });

  test("exposes all expected methods", () => {
    const expected = [
      "authorizeTow",
      "getAllParkingViolations",
      "getPermitsForVehicle",
      "getVehiclesForUnit",
      "issuePermit",
      "logViolation",
      "lookupVehicle",
      "registerVehicle",
    ];
    expect([...methods.keys()].sort()).toEqual(expected);
  });

  test("registerVehicle is an update call", () => {
    expect(methods.get("registerVehicle")!.isQuery).toBe(false);
  });

  test("issuePermit is an update call", () => {
    expect(methods.get("issuePermit")!.isQuery).toBe(false);
  });

  test("lookupVehicle is a query", () => {
    expect(methods.get("lookupVehicle")!.isQuery).toBe(true);
  });

  test("getAllParkingViolations is a query", () => {
    expect(methods.get("getAllParkingViolations")!.isQuery).toBe(true);
  });

  test("registerVehicle takes 7 args", () => {
    expect(methods.get("registerVehicle")!.argTypes).toHaveLength(7);
  });

  test("logViolation takes 6 args", () => {
    expect(methods.get("logViolation")!.argTypes).toHaveLength(6);
  });

  test("lookupVehicle takes 2 args (plateState, licensePlate)", () => {
    expect(methods.get("lookupVehicle")!.argTypes).toHaveLength(2);
  });
});

// ─── Vendors ──────────────────────────────────────────────────────────────────

describe("vendors IDL factory", () => {
  let methods: ReturnType<typeof extractService>;
  beforeAll(() => { methods = extractService(vendorsIdl); });

  test("exposes all expected methods", () => {
    const expected = [
      "addVendor",
      "addVendorReview",
      "getAllVendors",
      "getExpiringCOIs",
      "getJobsForVendor",
      "getVendor",
      "getVendorsByCategory",
      "logJob",
      "removeVendor",
      "updateCOI",
      "updateVendor",
    ];
    expect([...methods.keys()].sort()).toEqual(expected);
  });

  test("addVendor is an update call with 6 args", () => {
    const m = methods.get("addVendor")!;
    expect(m.isQuery).toBe(false);
    expect(m.argTypes).toHaveLength(6);
  });

  test("updateVendor is an update call with 6 args", () => {
    const m = methods.get("updateVendor")!;
    expect(m.isQuery).toBe(false);
    expect(m.argTypes).toHaveLength(6);
  });

  test("removeVendor is an update call with 1 arg", () => {
    const m = methods.get("removeVendor")!;
    expect(m.isQuery).toBe(false);
    expect(m.argTypes).toHaveLength(1);
  });

  test("addVendorReview is an update call with 2 args", () => {
    const m = methods.get("addVendorReview")!;
    expect(m.isQuery).toBe(false);
    expect(m.argTypes).toHaveLength(2);
  });

  test("logJob is an update call with 5 args", () => {
    const m = methods.get("logJob")!;
    expect(m.isQuery).toBe(false);
    expect(m.argTypes).toHaveLength(5);
  });

  test("updateCOI is an update call with 3 args", () => {
    const m = methods.get("updateCOI")!;
    expect(m.isQuery).toBe(false);
    expect(m.argTypes).toHaveLength(3);
  });

  test("getAllVendors is a query", () => {
    expect(methods.get("getAllVendors")!.isQuery).toBe(true);
  });

  test("getVendorsByCategory is a query with 1 arg", () => {
    const m = methods.get("getVendorsByCategory")!;
    expect(m.isQuery).toBe(true);
    expect(m.argTypes).toHaveLength(1);
  });

  test("getJobsForVendor is a query with 1 arg", () => {
    const m = methods.get("getJobsForVendor")!;
    expect(m.isQuery).toBe(true);
    expect(m.argTypes).toHaveLength(1);
  });

  test("getExpiringCOIs is a query with 1 arg", () => {
    const m = methods.get("getExpiringCOIs")!;
    expect(m.isQuery).toBe(true);
    expect(m.argTypes).toHaveLength(1);
  });
});

// ─── Discussions ──────────────────────────────────────────────────────────────

describe("discussions IDL factory", () => {
  let methods: ReturnType<typeof extractService>;
  beforeAll(() => { methods = extractService(discussionsIdl); });

  test("exposes all expected methods", () => {
    const expected = [
      "addReply",
      "createPost",
      "deletePost",
      "getAllPosts",
      "getPinnedPosts",
      "getPost",
      "getPostsByCategory",
      "getRepliesForPost",
      "lockPost",
      "pinPost",
    ];
    expect([...methods.keys()].sort()).toEqual(expected);
  });

  test("createPost is an update call with 3 args", () => {
    const m = methods.get("createPost")!;
    expect(m.isQuery).toBe(false);
    expect(m.argTypes).toHaveLength(3);
  });

  test("deletePost is an update call with 1 arg", () => {
    const m = methods.get("deletePost")!;
    expect(m.isQuery).toBe(false);
    expect(m.argTypes).toHaveLength(1);
  });

  test("addReply is an update call with 2 args", () => {
    const m = methods.get("addReply")!;
    expect(m.isQuery).toBe(false);
    expect(m.argTypes).toHaveLength(2);
  });

  test("pinPost is an update call with 1 arg", () => {
    const m = methods.get("pinPost")!;
    expect(m.isQuery).toBe(false);
    expect(m.argTypes).toHaveLength(1);
  });

  test("lockPost is an update call with 1 arg", () => {
    const m = methods.get("lockPost")!;
    expect(m.isQuery).toBe(false);
    expect(m.argTypes).toHaveLength(1);
  });

  test("getAllPosts is a query", () => {
    expect(methods.get("getAllPosts")!.isQuery).toBe(true);
  });

  test("getPinnedPosts is a query", () => {
    expect(methods.get("getPinnedPosts")!.isQuery).toBe(true);
  });

  test("getPostsByCategory is a query with 1 arg", () => {
    const m = methods.get("getPostsByCategory")!;
    expect(m.isQuery).toBe(true);
    expect(m.argTypes).toHaveLength(1);
  });

  test("getRepliesForPost is a query with 1 arg", () => {
    const m = methods.get("getRepliesForPost")!;
    expect(m.isQuery).toBe(true);
    expect(m.argTypes).toHaveLength(1);
  });
});
