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
      "castVote",
      "createProposal",
      "finalizeProposal",
      "getAllProposals",
      "getMyVote",
      "getOpenProposals",
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
});

// ─── Treasury ─────────────────────────────────────────────────────────────────

describe("treasury IDL factory", () => {
  let methods: ReturnType<typeof extractService>;
  beforeAll(() => { methods = extractService(treasuryIdl); });

  test("exposes all expected methods", () => {
    const expected = [
      "getAssessment",
      "getAssessmentsForUnit",
      "getOutstandingAssessments",
      "getTotalOutstandingCents",
      "markPaid",
      "postAssessment",
      "setMembersCanisterId",
      "waiveAssessment",
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
      "deleteDocument",
      "getAllDocumentsMeta",
      "getAllPublicDocumentsMeta",
      "getDocument",
      "getDocumentMeta",
      "getDocumentsByCategory",
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
});

// ─── Announcements ────────────────────────────────────────────────────────────

describe("announcements IDL factory", () => {
  let methods: ReturnType<typeof extractService>;
  beforeAll(() => { methods = extractService(announcementsIdl); });

  test("exposes all expected methods", () => {
    const expected = [
      "delete",
      "getActive",
      "getAll",
      "getAnnouncement",
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
