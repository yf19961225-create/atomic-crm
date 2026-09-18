import { describe, expect, it } from "vitest";
import fakeRestDataProvider from "ra-data-fakerest";
import {
  deriveFollowupState,
  saveWorkflowRecord,
  syncNextFollowup,
  toWorkflowWrite,
} from "./workflow";

describe("workflow write boundaries and calculated state", () => {
  it("uses newest contact time, not insertion order, and a cleared next date cancels the previous schedule", () => {
    expect(
      deriveFollowupState(
        [
          {
            id: 2,
            contacted_at: "2026-09-10T00:00:00Z",
            next_follow_up_at: null,
          },
          {
            id: 3,
            contacted_at: "2026-09-01T00:00:00Z",
            next_follow_up_at: "2026-09-05T00:00:00Z",
          },
        ],
        "replied",
        new Date("2026-09-17"),
      ),
    ).toEqual({
      last_contact_at: "2026-09-10T00:00:00Z",
      next_follow_up_at: null,
      follow_up_count: 2,
      overdue: false,
    });
  });
  it("uses persisted chronology to let a newer same-minute cancellation win", () => {
    expect(
      deriveFollowupState(
        [
          {
            id: "z-random-id",
            contacted_at: "2026-09-10T10:00:00Z",
            created_at: "2026-09-10T10:00:01Z",
            updated_at: "2026-09-10T10:00:01Z",
            next_follow_up_at: "2026-09-19T10:00:00Z",
          },
          {
            id: "a-random-id",
            contacted_at: "2026-09-10T10:00:00Z",
            created_at: "2026-09-10T10:00:02Z",
            updated_at: "2026-09-10T10:00:02Z",
            next_follow_up_at: null,
          },
        ],
        "replied",
        new Date("2026-09-17"),
      ),
    ).toMatchObject({
      last_contact_at: "2026-09-10T10:00:00Z",
      next_follow_up_at: null,
      overdue: false,
    });
  });
  it("calculates overdue without promoting or reclassifying any business status", () => {
    const history = [
      {
        id: 1,
        contacted_at: "2026-09-01T00:00:00Z",
        next_follow_up_at: "2026-09-05T00:00:00Z",
      },
    ];
    expect(
      deriveFollowupState(history, "to_develop", new Date("2026-09-17"))
        .overdue,
    ).toBe(true);
    expect(
      deriveFollowupState(history, "paused", new Date("2026-09-17")).overdue,
    ).toBe(false);
    expect(
      deriveFollowupState(history, "processed", new Date("2026-09-17")).overdue,
    ).toBe(false);
    expect(deriveFollowupState([], "to_develop")).toEqual({
      last_contact_at: null,
      next_follow_up_at: null,
      follow_up_count: 0,
      overdue: false,
    });
  });
  it("rejects unsupported statuses and empty companies even from a non-profile tab", () => {
    expect(() =>
      toWorkflowWrite("outbound", { name: "A", status: "customer" }),
    ).toThrow("请选择允许的状态");
    expect(() =>
      toWorkflowWrite("outbound", { name: "   ", status: "to_develop" }),
    ).toThrow("公司／客户名称为必填项");
    expect(() => toWorkflowWrite("customer", { status: "active" })).toThrow(
      "公司／客户名称为必填项",
    );
  });
  it("writes handling fields only and cannot overwrite website originals or computed fields", () => {
    expect(
      toWorkflowWrite("inquiry", {
        status: "processed",
        customer_name: "Rewrite",
        raw_payload: {},
        items: [],
        document_number: "OTHER",
        submitted_at: "2027",
        owner_id: "",
        formal_customer_id: "c-1",
      }),
    ).toEqual({
      status: "processed",
      owner_id: null,
      formal_customer_id: "c-1",
    });
    expect(
      toWorkflowWrite("outbound", {
        name: "A",
        status: "replied",
        follow_up_count: 100,
        last_contact_at: "2027",
        next_follow_up_at: "2028",
        id: "bad",
      }),
    ).toEqual({ name: "A", status: "replied" });
  });
  it("updates only the requested record and synchronizes schedule without status or customer mutations", async () => {
    const provider = fakeRestDataProvider({
      romiku_outbound_companies: [{ id: "o", name: "A", status: "to_develop" }],
      romiku_outbound_followups: [
        {
          id: 1,
          outbound_company_id: "o",
          contacted_at: "2026-09-10T00:00:00Z",
          next_follow_up_at: "2026-09-19T00:00:00Z",
        },
        {
          id: 2,
          outbound_company_id: "o",
          contacted_at: "2026-09-01T00:00:00Z",
          next_follow_up_at: "2026-09-03T00:00:00Z",
        },
      ],
      romiku_formal_customers: [],
    });
    await syncNextFollowup(provider, "outbound", "o");
    expect(
      (await provider.getOne("romiku_outbound_companies", { id: "o" })).data,
    ).toEqual({
      id: "o",
      name: "A",
      status: "to_develop",
      next_follow_up_at: "2026-09-19T00:00:00Z",
    });
    await saveWorkflowRecord(provider, "customer", {
      name: "Manual",
      status: "active",
      source_outbound_company_id: "o",
    });
    expect(
      (await provider.getOne("romiku_outbound_companies", { id: "o" })).data
        .status,
    ).toBe("to_develop");
  });
});
