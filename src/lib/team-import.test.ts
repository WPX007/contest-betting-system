import { describe, expect, it } from "vitest";
import { parseTeamWorkbook, prepareImportedRoster } from "./team-import";

describe("team workbook import", () => {
  it("parses member assignments and alliance groups", () => {
    const parsed = parseTeamWorkbook([
      {
        sheet: "队伍分配",
        data: [
          ["中文名", "英文名", "队伍名"],
          ["张三", "Alex", "战队01-A"],
          ["李四", "Lee", "战队02-A"],
        ],
      },
      {
        sheet: "联姻关系",
        data: [
          ["队伍名", "联姻组"],
          ["战队01-A", "甲"],
          ["战队02-A", "甲"],
        ],
      },
    ]);
    expect(parsed.members).toHaveLength(2);
    expect(parsed.members[0]).toMatchObject({ name: "张三", username: "Alex", teamName: "战队01-A" });
    expect(parsed.alliances).toEqual([{ source: "联姻组：甲", teamNames: ["战队01-A", "战队02-A"] }]);
  });

  it("supports direct married-team pairs", () => {
    const parsed = parseTeamWorkbook([
      {
        sheet: "配置",
        data: [
          ["姓名", "队伍", "联姻队伍"],
          ["张三", "战队01-B", "战队06-B"],
        ],
      },
    ]);
    expect(parsed.alliances[0].teamNames).toEqual(["战队01-B", "战队06-B"]);
  });

  it("requires an english username before opening accounts", () => {
    const roster = prepareImportedRoster(parseTeamWorkbook([
      {
        sheet: "成员",
        data: [
          ["中文名", "英文名", "队伍名"],
          ["张三", "", "战队01-A"],
        ],
      },
    ]));
    expect(roster.errors[0]).toContain("缺少英文名");
  });

  it("parses horizontal A/B paired team sheets", () => {
    const parsed = parseTeamWorkbook([
      {
        sheet: "队伍总表",
        data: [
          ["配对", "A队", "A队队长", "A队队员", "A队人数", "B队", "B队队长", "B队队员", "B队人数"],
          [
            1,
            "A1",
            "jinzhe(柯文宇)",
            "dimoomao（毛帅）、kunaguo(郭琦)，butiyawu(吴宇珩)",
            4,
            "B1",
            "johnsmzhang(张斯铭)",
            "cooxinwang(王可欣)、lijiefeng(冯利杰)",
            3,
          ],
        ],
      },
    ]);

    expect(parsed.members).toEqual([
      { sheet: "队伍总表", row: 2, username: "jinzhe", name: "柯文宇", teamName: "战队01-A", track: "A", isCaptain: true },
      { sheet: "队伍总表", row: 2, username: "dimoomao", name: "毛帅", teamName: "战队01-A", track: "A", isCaptain: false },
      { sheet: "队伍总表", row: 2, username: "kunaguo", name: "郭琦", teamName: "战队01-A", track: "A", isCaptain: false },
      { sheet: "队伍总表", row: 2, username: "butiyawu", name: "吴宇珩", teamName: "战队01-A", track: "A", isCaptain: false },
      { sheet: "队伍总表", row: 2, username: "johnsmzhang", name: "张斯铭", teamName: "战队01-B", track: "B", isCaptain: true },
      { sheet: "队伍总表", row: 2, username: "cooxinwang", name: "王可欣", teamName: "战队01-B", track: "B", isCaptain: false },
      { sheet: "队伍总表", row: 2, username: "lijiefeng", name: "冯利杰", teamName: "战队01-B", track: "B", isCaptain: false },
    ]);
    const roster = prepareImportedRoster(parsed);
    expect(roster.errors).toEqual([]);
    expect(roster.members[0]).toMatchObject({ username: "jinzhe", role: "CAPTAIN", teamName: "战队01-A" });
    expect(roster.members[1]).toMatchObject({ username: "dimoomao", role: "PLAYER" });
    expect(parsed.alliances).toEqual([
      { source: "联姻队伍配对", teamNames: ["战队01-A", "战队01-B"] },
    ]);
  });

  it("uses the A/B columns as track information for free-form team names", () => {
    const parsed = parseTeamWorkbook([
      {
        sheet: "AB分组配对表",
        data: [
          ["配对", "A队", "A队队长", "A队队员", "A队人数", "B队", "B队队长", "B队队员", "B队人数"],
          [
            1,
            "何汉宇队",
            "jinzhe(何汉宇)",
            "dimoomao(毛帅)、kunaguo(郭琦)",
            3,
            "张斯铭队",
            "johnsmzhang(张斯铭)",
            "cooxinwang(王可欣)、lijiefeng(冯利杰)",
            3,
          ],
        ],
      },
    ]);

    const roster = prepareImportedRoster(parsed);
    expect(roster.errors).toEqual([]);
    expect(roster.members[0]).toMatchObject({ teamName: "何汉宇队", track: "A", role: "CAPTAIN" });
    expect(roster.members[3]).toMatchObject({ teamName: "张斯铭队", track: "B", role: "CAPTAIN" });
    expect(parsed.alliances[0].teamNames).toEqual(["何汉宇队", "张斯铭队"]);
  });
});
