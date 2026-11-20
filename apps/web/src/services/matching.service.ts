import { query } from '@project3/db';
import {
  AlternativeCandidate,
  BreakdownScore,
  MatchExclusionItem,
  MatchResultItem,
  MatchRunDetail,
  MatchingParams,
} from '@project3/shared';

export class MatchingService {
  static async executeMatchRun(
    requirementId: number,
    userId: number,
    overrideParams?: Partial<MatchingParams>
  ): Promise<{ runId: string }> {
    const paramsJson = JSON.stringify(overrideParams || {});
    const res = await query(
      `SELECT fn_run_match($1, $2, $3::jsonb) AS run_id`,
      [requirementId, userId, paramsJson]
    );

    const runId = res.rows[0].run_id;

    // Generate Pros/Cons and explanations in service layer (D4, Gap G2)
    await this.enrichRunExplanations(runId);

    return { runId };
  }

  static async getRunDetail(runId: string): Promise<MatchRunDetail | null> {
    const runRes = await query(
      `SELECT r.id, r.run_code, r.requirement_id, r.config_id, r.matrix_id,
              r.params_snapshot, r.summary, r.data_as_of, r.created_at
       FROM match_run r
       WHERE r.id = $1`,
      [runId]
    );

    if (runRes.rows.length === 0) return null;
    const runRow = runRes.rows[0];

    // Results
    const resultsRes = await query(
      `SELECT mr.id, mr.run_id, mr.player_id, p.name as player_name, fn_age(p.date_of_birth) as age,
              p.position, cl.name as club_name, cl.league, p.market_value,
              mr.rank, mr.matching, mr.f_score, mr.s_score, mr.r_score,
              mr.requested_role_id, tr.name as requested_role_name,
              mr.recommendation, mr.breakdown, mr.pros, mr.cons, mr.flags, mr.explanation
       FROM match_result mr
       JOIN player p ON p.id = mr.player_id
       LEFT JOIN contract c ON c.player_id = p.id AND c.status = 'active' AND current_date BETWEEN c.start_date AND c.end_date
       LEFT JOIN club cl ON cl.id = c.club_id
       LEFT JOIN tactical_role tr ON tr.id = mr.requested_role_id
       WHERE mr.run_id = $1
       ORDER BY mr.rank ASC NULLS LAST, mr.matching DESC NULLS LAST`,
      [runId]
    );

    // Exclusions
    const exclusionsRes = await query(
      `SELECT me.player_id, p.name as player_name, p.position, me.reasons
       FROM match_exclusion me
       JOIN player p ON p.id = me.player_id
       WHERE me.run_id = $1
       ORDER BY p.name ASC`,
      [runId]
    );

    return {
      id: runRow.id,
      runCode: runRow.run_code,
      requirementId: runRow.requirement_id,
      configId: runRow.config_id,
      matrixId: runRow.matrix_id,
      paramsSnapshot: runRow.params_snapshot,
      summary: runRow.summary || {},
      dataAsOf: runRow.data_as_of,
      createdAt: runRow.created_at,
      results: resultsRes.rows.map(this.mapResultRow),
      exclusions: exclusionsRes.rows.map(this.mapExclusionRow),
    };
  }

  static async getAlternatives(
    playerId: number,
    requirementId: number,
    limit: number = 3
  ): Promise<AlternativeCandidate[]> {
    const res = await query(
      `SELECT player_id, player_name, position, age, club_name, fee_est, f_score, s_score, matching, similarity_score
       FROM fn_alternatives($1, $2, $3)`,
      [playerId, requirementId, limit]
    );

    return res.rows.map((r) => ({
      playerId: r.player_id,
      playerName: r.player_name,
      position: r.position,
      age: r.age,
      clubName: r.club_name,
      feeEst: parseFloat(r.fee_est),
      fScore: parseFloat(r.f_score),
      sScore: parseFloat(r.s_score),
      matching: parseFloat(r.matching),
      similarityScore: parseFloat(r.similarity_score),
    }));
  }

  static async comparePlayers(playerIds: number[]) {
    if (!playerIds || playerIds.length < 2) {
      throw { code: 'INVALID_COMPARE_COUNT', message: 'Cần tối thiểu 2 cầu thủ để so sánh', status: 400 };
    }

    const cardsRes = await query(
      `SELECT * FROM v_player_card WHERE id = ANY($1::int[])`,
      [playerIds]
    );

    const vectorsRes = await query(
      `SELECT s.player_id, r.name as role, s.score, r.position_group
       FROM player_role_score s
       JOIN tactical_role r ON r.id = s.role_id
       WHERE s.player_id = ANY($1::int[])
         AND s.season = (SELECT max(season) FROM player_stats WHERE deleted_at IS NULL)
       ORDER BY s.player_id, s.score DESC`,
      [playerIds]
    );

    return {
      players: cardsRes.rows,
      roleVectors: vectorsRes.rows,
    };
  }

  private static async enrichRunExplanations(runId: string): Promise<void> {
    const results = await query(
      `SELECT mr.id, mr.matching, mr.f_score, mr.s_score, mr.r_score,
              mr.requested_role_id, tr.name as role_name, mr.breakdown, mr.flags,
              p.name as player_name, fn_age(p.date_of_birth) as age
       FROM match_result mr
       JOIN player p ON p.id = mr.player_id
       LEFT JOIN tactical_role tr ON tr.id = mr.requested_role_id
       WHERE mr.run_id = $1`,
      [runId]
    );

    for (const row of results.rows) {
      const pros: string[] = [];
      const cons: string[] = [];
      const bd = row.breakdown || {};
      const fScore = parseFloat(row.f_score) || 0;
      const sScore = parseFloat(row.s_score) || 0;
      const rScore = parseFloat(row.r_score) || 0;
      const matching = parseFloat(row.matching) || 0;

      // F Pillar
      if (fScore >= 75) {
        pros.push(`Tài chính rất khả thi: Phí và mức lương nằm trọn vẹn trong vùng an toàn của ngân sách`);
      } else if (fScore < 50) {
        cons.push(`Chi phí chuyển nhượng hoặc mức lương tiệm cận mức trần của CLB`);
      }

      if (bd.years_left !== undefined && bd.years_left <= 0.5) {
        pros.push(`Thời hạn hợp đồng còn dưới 6 tháng - Lợi thế đàm phán mức phí rẻ hoặc chuyển nhượng tự do`);
      }

      // S Pillar
      if (sScore >= 80) {
        pros.push(`Tương thích chiến thuật vượt trội trong vai trò ${row.role_name || 'chuyên môn'} (${sScore.toFixed(1)} điểm)`);
      } else if (sScore < 60) {
        cons.push(`Điểm vai trò chiến thuật ở mức vừa phải (${sScore.toFixed(1)} điểm)`);
      }

      // R Pillar
      const rInj = bd.r_inj !== undefined ? parseFloat(bd.r_inj) : null;
      if (rInj !== null && rInj >= 85) {
        pros.push(`Hồ sơ thể lực rất tốt: Không có ca chấn thương nghiêm trọng trong 24 tháng`);
      } else if (rInj !== null && rInj < 65) {
        cons.push(`Cần lưu ý tiền sử chấn thương trong 24 tháng gần nhất`);
      }

      if (row.age <= 23) {
        pros.push(`Cầu thủ trẻ (U23), tiềm năng phát triển và giá trị chuyển nhượng tương lai cao`);
      } else if (row.age >= 32) {
        cons.push(`Độ tuổi ${row.age} có thể làm suy giảm giá trị bán lại sau 2-3 năm`);
      }

      const flags: string[] = row.flags || [];
      if (flags.includes('ROLE_TIE')) {
        pros.push(`Đa năng: Có thể thi đấu tốt ở ít nhất 2 vai trò chiến thuật với điểm số tương đương`);
      }

      const dominantPillar =
        sScore >= fScore && sScore >= rScore
          ? 'chuyên môn chiến thuật'
          : fScore >= rScore
          ? 'tính khả thi tài chính'
          : 'độ an toàn và tiềm năng';

      const explanation = `Cầu thủ ${row.player_name} đạt ${matching.toFixed(1)} điểm Matching. Thế mạnh nổi bật nhất nằm ở ${dominantPillar}. Điểm thành phần: Tài chính F=${fScore.toFixed(1)}, Chiến thuật S=${sScore.toFixed(1)}, Rủi ro R=${rScore.toFixed(1)}.`;

      await query(
        `UPDATE match_result
         SET pros = $1::jsonb, cons = $2::jsonb, explanation = $3
         WHERE id = $4`,
        [JSON.stringify(pros), JSON.stringify(cons), explanation, row.id]
      );
    }
  }

  private static mapResultRow(row: any): MatchResultItem {
    return {
      id: row.id,
      runId: row.run_id,
      playerId: row.player_id,
      playerName: row.player_name,
      age: row.age,
      position: row.position,
      clubName: row.club_name,
      league: row.league,
      marketValue: row.market_value ? parseFloat(row.market_value) : null,
      rank: row.rank,
      matching: row.matching !== null ? parseFloat(row.matching) : null,
      fScore: row.f_score !== null ? parseFloat(row.f_score) : null,
      sScore: row.s_score !== null ? parseFloat(row.s_score) : null,
      rScore: row.r_score !== null ? parseFloat(row.r_score) : null,
      requestedRoleId: row.requested_role_id,
      requestedRoleName: row.requested_role_name,
      recommendation: row.recommendation,
      breakdown: row.breakdown || {},
      pros: row.pros || [],
      cons: row.cons || [],
      flags: row.flags || [],
      explanation: row.explanation,
    };
  }

  private static mapExclusionRow(row: any): MatchExclusionItem {
    return {
      playerId: row.player_id,
      playerName: row.player_name,
      position: row.position,
      reasons: row.reasons || [],
    };
  }
}
