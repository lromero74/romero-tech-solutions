import express from 'express';
import { getPool } from '../../config/database.js';

const router = express.Router();

/**
 * Get employee calendar data with service request engagements
 * Supports date range filtering and different view types (day, week, month)
 */
router.get('/employee-calendar', async (req, res) => {
  try {
    const pool = await getPool();
    const { startDate, endDate, view = 'week', employeeId } = req.query;

    // Default to current week if no date range provided
    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Base query to get employees with their service request assignments
    let employeeFilter = '';
    let params = [start, end];

    if (employeeId) {
      employeeFilter = 'AND e.id = $3';
      params.push(employeeId);
    }

    const query = `
      WITH employee_engagements AS (
        SELECT
          e.id as employee_id,
          e.first_name,
          e.last_name,
          e.email,
          e.phone,
          ews.status_name as working_status,
          ep.file_url as photo_url,
          ep.position_x as photo_position_x,
          ep.position_y as photo_position_y,
          ep.scale_factor as photo_scale,
          ep.background_color as photo_background_color,
          sr.id as service_request_id,
          sr.request_number,
          sr.title as request_title,
          sr.scheduled_date,
          sr.scheduled_time_start,
          sr.scheduled_time_end,
          sr.requested_date,
          sr.requested_time_start,
          sr.requested_time_end,
          sra.assigned_at,
          sra.assignment_type,
          sra.is_active as assignment_active,
          srs.name as request_status,
          sts.name as service_type,
          sl.address_label as location_name,
          CASE
            WHEN sr.scheduled_date IS NOT NULL AND sr.scheduled_time_start IS NOT NULL
            THEN sr.scheduled_date + sr.scheduled_time_start
            WHEN sr.requested_date IS NOT NULL AND sr.requested_time_start IS NOT NULL
            THEN sr.requested_date + sr.requested_time_start
            ELSE NULL
          END as start_datetime,
          CASE
            WHEN sr.scheduled_date IS NOT NULL AND sr.scheduled_time_end IS NOT NULL
            THEN sr.scheduled_date + sr.scheduled_time_end
            WHEN sr.requested_date IS NOT NULL AND sr.requested_time_end IS NOT NULL
            THEN sr.requested_date + sr.requested_time_end
            ELSE NULL
          END as end_datetime,
          CASE
            -- First check if working status is null (no status assigned)
            WHEN ews.status_name IS NULL THEN 'unavailable'
            -- Then check employee working status
            WHEN LOWER(ews.status_name) IN ('inactive', 'on_vacation', 'out_sick', 'on_other_leave') THEN 'unavailable'
            -- Then check service request status if employee is available
            WHEN LOWER(srs.name) = 'completed' THEN 'completed'
            WHEN LOWER(srs.name) = 'in progress' THEN 'engaged'
            WHEN LOWER(srs.name) IN ('assigned', 'scheduled') THEN 'scheduled'
            WHEN LOWER(srs.name) = 'pending' AND sra.is_active = true THEN 'pending'
            -- Only show as available if working status is explicitly 'available'
            WHEN LOWER(ews.status_name) = 'available' THEN 'available'
            ELSE 'unavailable'
          END as engagement_status
        FROM employees e
        LEFT JOIN employee_working_statuses ews ON e.working_status_id = ews.id
        LEFT JOIN employee_photos ep ON e.id = ep.employee_id
        LEFT JOIN service_request_assignments sra ON e.id = sra.technician_id AND sra.is_active = true
        LEFT JOIN service_requests sr ON sra.service_request_id = sr.id
        LEFT JOIN service_request_statuses srs ON sr.status_id = srs.id
        LEFT JOIN service_types sts ON sr.service_type_id = sts.id
        LEFT JOIN service_locations sl ON sr.service_location_id = sl.id
        WHERE e.is_active = true
          AND (
            sr.id IS NULL
            OR sr.scheduled_date BETWEEN $1 AND $2
            OR sr.requested_date BETWEEN $1 AND $2
          )
          ${employeeFilter}
        ORDER BY e.last_name, e.first_name, start_datetime
      )
      SELECT * FROM employee_engagements;
    `;

    const result = await pool.query(query, params);

    // Group results by employee
    const employeeCalendar = {};

    result.rows.forEach(row => {
      const employeeId = row.employee_id;

      if (!employeeCalendar[employeeId]) {
        employeeCalendar[employeeId] = {
          id: employeeId,
          firstName: row.first_name,
          lastName: row.last_name,
          email: row.email,
          phone: row.phone,
          workingStatus: row.working_status,
          photo: row.photo_url,
          photoPositionX: row.photo_position_x,
          photoPositionY: row.photo_position_y,
          photoScale: row.photo_scale,
          photoBackgroundColor: row.photo_background_color,
          engagements: []
        };
      }

      // Only add engagement if there's a service request
      if (row.service_request_id) {
        employeeCalendar[employeeId].engagements.push({
          serviceRequestId: row.service_request_id,
          requestNumber: row.request_number,
          title: row.request_title,
          scheduledDate: row.scheduled_date,
          scheduledTimeStart: row.scheduled_time_start,
          scheduledTimeEnd: row.scheduled_time_end,
          requestedDate: row.requested_date,
          requestedTimeStart: row.requested_time_start,
          requestedTimeEnd: row.requested_time_end,
          assignedAt: row.assigned_at,
          assignmentType: row.assignment_type,
          assignmentActive: row.assignment_active,
          requestStatus: row.request_status,
          serviceType: row.service_type,
          locationName: row.location_name,
          startDatetime: row.start_datetime,
          endDatetime: row.end_datetime,
          engagementStatus: row.engagement_status
        });
      }
    });

    // Convert to array format
    const employees = Object.values(employeeCalendar);

    res.json({
      success: true,
      data: {
        employees,
        dateRange: { startDate: start, endDate: end },
        view,
        totalEmployees: employees.length,
        totalEngagements: employees.reduce((sum, emp) => sum + emp.engagements.length, 0)
      }
    });

  } catch (error) {
    console.error('Error fetching employee calendar data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employee calendar data',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * Get employee availability summary for a specific date range
 */
router.get('/employee-availability', async (req, res) => {
  try {
    const pool = await getPool();
    const { date = new Date().toISOString().split('T')[0] } = req.query;

    const query = `
      SELECT
        e.id,
        e.first_name,
        e.last_name,
        ews.status_name as working_status,
        COUNT(CASE WHEN sra.is_active = true AND sr.scheduled_date = $1 THEN 1 END) as scheduled_requests,
        COUNT(CASE WHEN sra.is_active = true AND sr.scheduled_date = $1 AND LOWER(srs.name) = 'in progress' THEN 1 END) as active_requests,
        CASE
          -- First check if working status is null (no status assigned)
          WHEN ews.status_name IS NULL THEN 'unavailable'
          -- Then check employee working status
          WHEN LOWER(ews.status_name) IN ('inactive', 'on_vacation', 'out_sick', 'on_other_leave') THEN 'unavailable'
          -- Then check service request engagement if employee is available
          WHEN COUNT(CASE WHEN sra.is_active = true AND sr.scheduled_date = $1 AND LOWER(srs.name) = 'in progress' THEN 1 END) > 0 THEN 'engaged'
          WHEN COUNT(CASE WHEN sra.is_active = true AND sr.scheduled_date = $1 THEN 1 END) > 0 THEN 'scheduled'
          -- Only show as available if working status is explicitly 'available'
          WHEN LOWER(ews.status_name) = 'available' THEN 'available'
          ELSE 'unavailable'
        END as availability_status
      FROM employees e
      LEFT JOIN employee_working_statuses ews ON e.working_status_id = ews.id
      LEFT JOIN service_request_assignments sra ON e.id = sra.technician_id AND sra.is_active = true
      LEFT JOIN service_requests sr ON sra.service_request_id = sr.id
      LEFT JOIN service_request_statuses srs ON sr.status_id = srs.id
      WHERE e.is_active = true
      GROUP BY e.id, e.first_name, e.last_name, ews.status_name
      ORDER BY e.last_name, e.first_name;
    `;

    const result = await pool.query(query, [date]);

    res.json({
      success: true,
      data: {
        date,
        employees: result.rows,
        summary: {
          total: result.rows.length,
          available: result.rows.filter(emp => emp.availability_status === 'available').length,
          scheduled: result.rows.filter(emp => emp.availability_status === 'scheduled').length,
          engaged: result.rows.filter(emp => emp.availability_status === 'engaged').length,
          unavailable: result.rows.filter(emp => emp.availability_status === 'unavailable').length
        }
      }
    });

  } catch (error) {
    console.error('Error fetching employee availability:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employee availability',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * Get time entries for employee calendar (if time tracking is enabled)
 */
router.get('/employee-time-entries', async (req, res) => {
  try {
    const pool = await getPool();
    const { startDate, endDate, employeeId } = req.query;

    let employeeFilter = '';
    let params = [startDate, endDate];

    if (employeeId) {
      employeeFilter = 'AND e.id = $3';
      params.push(employeeId);
    }

    const query = `
      SELECT
        e.id as employee_id,
        e.first_name,
        e.last_name,
        sr.request_number,
        sr.title as request_title,
        te.start_time,
        te.end_time,
        te.duration_minutes,
        te.description,
        te.is_billable,
        te.created_at
      FROM employees e
      JOIN service_request_time_entries te ON e.id = te.employee_id
      JOIN service_requests sr ON te.service_request_id = sr.id
      WHERE DATE(te.start_time) BETWEEN $1 AND $2
        ${employeeFilter}
      ORDER BY e.last_name, e.first_name, te.start_time;
    `;

    const result = await pool.query(query, params);

    // Group by employee
    const timeEntries = {};
    result.rows.forEach(row => {
      const employeeId = row.employee_id;
      if (!timeEntries[employeeId]) {
        timeEntries[employeeId] = {
          employeeId,
          firstName: row.first_name,
          lastName: row.last_name,
          entries: []
        };
      }

      timeEntries[employeeId].entries.push({
        requestNumber: row.request_number,
        requestTitle: row.request_title,
        startTime: row.start_time,
        endTime: row.end_time,
        durationMinutes: row.duration_minutes,
        description: row.description,
        isBillable: row.is_billable,
        createdAt: row.created_at
      });
    });

    res.json({
      success: true,
      data: {
        employees: Object.values(timeEntries),
        dateRange: { startDate, endDate }
      }
    });

  } catch (error) {
    console.error('Error fetching employee time entries:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employee time entries',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

export default router;