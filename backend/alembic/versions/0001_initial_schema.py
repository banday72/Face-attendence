"""initial schema

Revision ID: 80d44692b864
Revises: 
Create Date: 2026-11-24 15:23:53.883635

"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = '80d44692b864'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('classrooms',
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('building', sa.String(length=100), nullable=True),
    sa.Column('room', sa.String(length=30), nullable=True),
    sa.Column('latitude', sa.Float(), nullable=False),
    sa.Column('longitude', sa.Float(), nullable=False),
    sa.Column('radius_override_meters', sa.Float(), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_classrooms'))
    )
    with op.batch_alter_table('classrooms', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_classrooms_name'), ['name'], unique=True)

    op.create_table('departments',
    sa.Column('name', sa.String(length=150), nullable=False),
    sa.Column('code', sa.String(length=20), nullable=False),
    sa.Column('description', sa.String(length=500), nullable=True),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_departments'))
    )
    with op.batch_alter_table('departments', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_departments_code'), ['code'], unique=True)
        batch_op.create_index(batch_op.f('ix_departments_name'), ['name'], unique=True)

    op.create_table('users',
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('hashed_password', sa.String(length=255), nullable=False),
    sa.Column('full_name', sa.String(length=150), nullable=False),
    sa.Column('role', sa.String(length=20), nullable=False),
    sa.Column('phone', sa.String(length=30), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_users'))
    )
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_users_email'), ['email'], unique=True)
        batch_op.create_index(batch_op.f('ix_users_role'), ['role'], unique=False)

    op.create_table('audit_logs',
    sa.Column('actor_user_id', sa.String(length=36), nullable=True),
    sa.Column('action', sa.String(length=100), nullable=False),
    sa.Column('entity_type', sa.String(length=60), nullable=False),
    sa.Column('entity_id', sa.String(length=36), nullable=True),
    sa.Column('before_json', sa.JSON(), nullable=False),
    sa.Column('after_json', sa.JSON(), nullable=False),
    sa.Column('reason', sa.String(length=500), nullable=True),
    sa.Column('ip_address', sa.String(length=64), nullable=True),
    sa.Column('user_agent', sa.String(length=500), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.ForeignKeyConstraint(['actor_user_id'], ['users.id'], name=op.f('fk_audit_logs_actor_user_id_users'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_audit_logs'))
    )
    with op.batch_alter_table('audit_logs', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_audit_logs_action'), ['action'], unique=False)
        batch_op.create_index(batch_op.f('ix_audit_logs_actor_user_id'), ['actor_user_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_audit_logs_entity_id'), ['entity_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_audit_logs_entity_type'), ['entity_type'], unique=False)

    op.create_table('courses',
    sa.Column('code', sa.String(length=30), nullable=False),
    sa.Column('name', sa.String(length=150), nullable=False),
    sa.Column('credits', sa.Integer(), nullable=False),
    sa.Column('department_id', sa.String(length=36), nullable=False),
    sa.Column('description', sa.String(length=500), nullable=True),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['department_id'], ['departments.id'], name=op.f('fk_courses_department_id_departments'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_courses'))
    )
    with op.batch_alter_table('courses', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_courses_code'), ['code'], unique=True)
        batch_op.create_index(batch_op.f('ix_courses_department_id'), ['department_id'], unique=False)

    op.create_table('professors',
    sa.Column('user_id', sa.String(length=36), nullable=False),
    sa.Column('employee_id', sa.String(length=50), nullable=False),
    sa.Column('department_id', sa.String(length=36), nullable=True),
    sa.Column('title', sa.String(length=50), nullable=True),
    sa.Column('office', sa.String(length=80), nullable=True),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['department_id'], ['departments.id'], name=op.f('fk_professors_department_id_departments'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_professors_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_professors'))
    )
    with op.batch_alter_table('professors', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_professors_department_id'), ['department_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_professors_employee_id'), ['employee_id'], unique=True)
        batch_op.create_index(batch_op.f('ix_professors_user_id'), ['user_id'], unique=True)

    op.create_table('refresh_tokens',
    sa.Column('user_id', sa.String(length=36), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('expires_at', sa.DateTime(), nullable=False),
    sa.Column('revoked_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_refresh_tokens_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_refresh_tokens'))
    )
    with op.batch_alter_table('refresh_tokens', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_refresh_tokens_token_hash'), ['token_hash'], unique=True)
        batch_op.create_index(batch_op.f('ix_refresh_tokens_user_id'), ['user_id'], unique=False)

    op.create_table('students',
    sa.Column('user_id', sa.String(length=36), nullable=False),
    sa.Column('university_id', sa.String(length=50), nullable=False),
    sa.Column('department_id', sa.String(length=36), nullable=True),
    sa.Column('program', sa.String(length=120), nullable=True),
    sa.Column('year_level', sa.Integer(), nullable=True),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['department_id'], ['departments.id'], name=op.f('fk_students_department_id_departments'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_students_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_students'))
    )
    with op.batch_alter_table('students', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_students_department_id'), ['department_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_students_university_id'), ['university_id'], unique=True)
        batch_op.create_index(batch_op.f('ix_students_user_id'), ['user_id'], unique=True)

    op.create_table('biometric_consents',
    sa.Column('student_id', sa.String(length=36), nullable=False),
    sa.Column('consent_version', sa.String(length=20), nullable=False),
    sa.Column('consented_at', sa.DateTime(), nullable=False),
    sa.Column('revoked_at', sa.DateTime(), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['student_id'], ['students.id'], name=op.f('fk_biometric_consents_student_id_students'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_biometric_consents'))
    )
    with op.batch_alter_table('biometric_consents', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_biometric_consents_student_id'), ['student_id'], unique=True)

    op.create_table('classes',
    sa.Column('course_id', sa.String(length=36), nullable=False),
    sa.Column('professor_id', sa.String(length=36), nullable=True),
    sa.Column('department_id', sa.String(length=36), nullable=True),
    sa.Column('section', sa.String(length=30), nullable=False),
    sa.Column('term', sa.String(length=30), nullable=False),
    sa.Column('name', sa.String(length=150), nullable=True),
    sa.Column('capacity', sa.Integer(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['course_id'], ['courses.id'], name=op.f('fk_classes_course_id_courses'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['department_id'], ['departments.id'], name=op.f('fk_classes_department_id_departments'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['professor_id'], ['professors.id'], name=op.f('fk_classes_professor_id_professors'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_classes')),
    sa.UniqueConstraint('course_id', 'section', 'term', name='uq_classes_course_section_term')
    )
    with op.batch_alter_table('classes', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_classes_course_id'), ['course_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_classes_department_id'), ['department_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_classes_professor_id'), ['professor_id'], unique=False)

    op.create_table('face_embeddings',
    sa.Column('student_id', sa.String(length=36), nullable=False),
    sa.Column('encrypted_embedding', sa.Text(), nullable=False),
    sa.Column('model_name', sa.String(length=80), nullable=False),
    sa.Column('vector_version', sa.String(length=20), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['student_id'], ['students.id'], name=op.f('fk_face_embeddings_student_id_students'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_face_embeddings'))
    )
    with op.batch_alter_table('face_embeddings', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_face_embeddings_is_active'), ['is_active'], unique=False)
        batch_op.create_index(batch_op.f('ix_face_embeddings_student_id'), ['student_id'], unique=False)

    op.create_table('attendance_sessions',
    sa.Column('class_id', sa.String(length=36), nullable=False),
    sa.Column('classroom_id', sa.String(length=36), nullable=True),
    sa.Column('professor_id', sa.String(length=36), nullable=True),
    sa.Column('starts_at', sa.DateTime(), nullable=False),
    sa.Column('ends_at', sa.DateTime(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('require_face', sa.Boolean(), nullable=False),
    sa.Column('require_location', sa.Boolean(), nullable=False),
    sa.Column('late_minutes', sa.Integer(), nullable=False),
    sa.Column('qr_validity_seconds', sa.Integer(), nullable=False),
    sa.Column('qr_refresh_seconds', sa.Integer(), nullable=False),
    sa.Column('challenge', sa.String(length=40), nullable=True),
    sa.Column('current_qr_hash', sa.String(length=64), nullable=True),
    sa.Column('current_qr_expires_at', sa.DateTime(), nullable=True),
    sa.Column('qr_generation', sa.Integer(), nullable=False),
    sa.Column('notes', sa.String(length=500), nullable=True),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['class_id'], ['classes.id'], name=op.f('fk_attendance_sessions_class_id_classes'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['classroom_id'], ['classrooms.id'], name=op.f('fk_attendance_sessions_classroom_id_classrooms'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['professor_id'], ['professors.id'], name=op.f('fk_attendance_sessions_professor_id_professors'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_attendance_sessions'))
    )
    with op.batch_alter_table('attendance_sessions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_attendance_sessions_class_id'), ['class_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_attendance_sessions_classroom_id'), ['classroom_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_attendance_sessions_current_qr_hash'), ['current_qr_hash'], unique=True)
        batch_op.create_index(batch_op.f('ix_attendance_sessions_ends_at'), ['ends_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_attendance_sessions_professor_id'), ['professor_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_attendance_sessions_starts_at'), ['starts_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_attendance_sessions_status'), ['status'], unique=False)

    op.create_table('enrollments',
    sa.Column('class_id', sa.String(length=36), nullable=False),
    sa.Column('student_id', sa.String(length=36), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['class_id'], ['classes.id'], name=op.f('fk_enrollments_class_id_classes'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['student_id'], ['students.id'], name=op.f('fk_enrollments_student_id_students'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_enrollments')),
    sa.UniqueConstraint('class_id', 'student_id', name='uq_enrollments_class_student')
    )
    with op.batch_alter_table('enrollments', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_enrollments_class_id'), ['class_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_enrollments_student_id'), ['student_id'], unique=False)

    op.create_table('schedules',
    sa.Column('class_id', sa.String(length=36), nullable=False),
    sa.Column('classroom_id', sa.String(length=36), nullable=True),
    sa.Column('day_of_week', sa.Integer(), nullable=False),
    sa.Column('start_time', sa.Time(), nullable=False),
    sa.Column('end_time', sa.Time(), nullable=False),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['class_id'], ['classes.id'], name=op.f('fk_schedules_class_id_classes'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['classroom_id'], ['classrooms.id'], name=op.f('fk_schedules_classroom_id_classrooms'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_schedules')),
    sa.UniqueConstraint('class_id', 'day_of_week', 'start_time', name='uq_schedules_class_day_start')
    )
    with op.batch_alter_table('schedules', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_schedules_class_id'), ['class_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_schedules_classroom_id'), ['classroom_id'], unique=False)

    op.create_table('attendance_records',
    sa.Column('session_id', sa.String(length=36), nullable=False),
    sa.Column('student_id', sa.String(length=36), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('method', sa.String(length=20), nullable=False),
    sa.Column('marked_at', sa.DateTime(), nullable=False),
    sa.Column('latitude', sa.Float(), nullable=True),
    sa.Column('longitude', sa.Float(), nullable=True),
    sa.Column('accuracy', sa.Float(), nullable=True),
    sa.Column('face_score', sa.Float(), nullable=True),
    sa.Column('location_status', sa.String(length=20), nullable=False),
    sa.Column('face_status', sa.String(length=20), nullable=False),
    sa.Column('challenge', sa.String(length=40), nullable=True),
    sa.Column('is_manual', sa.Boolean(), nullable=False),
    sa.Column('correction_reason', sa.String(length=500), nullable=True),
    sa.Column('corrected_by_user_id', sa.String(length=36), nullable=True),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['corrected_by_user_id'], ['users.id'], name=op.f('fk_attendance_records_corrected_by_user_id_users'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['session_id'], ['attendance_sessions.id'], name=op.f('fk_attendance_records_session_id_attendance_sessions'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['student_id'], ['students.id'], name=op.f('fk_attendance_records_student_id_students'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_attendance_records')),
    sa.UniqueConstraint('session_id', 'student_id', name='uq_attendance_records_session_student')
    )
    with op.batch_alter_table('attendance_records', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_attendance_records_corrected_by_user_id'), ['corrected_by_user_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_attendance_records_marked_at'), ['marked_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_attendance_records_method'), ['method'], unique=False)
        batch_op.create_index(batch_op.f('ix_attendance_records_session_id'), ['session_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_attendance_records_status'), ['status'], unique=False)
        batch_op.create_index(batch_op.f('ix_attendance_records_student_id'), ['student_id'], unique=False)

    op.create_table('qr_token_usages',
    sa.Column('session_id', sa.String(length=36), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('student_id', sa.String(length=36), nullable=False),
    sa.Column('used_at', sa.DateTime(), nullable=False),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['session_id'], ['attendance_sessions.id'], name=op.f('fk_qr_token_usages_session_id_attendance_sessions'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['student_id'], ['students.id'], name=op.f('fk_qr_token_usages_student_id_students'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_qr_token_usages')),
    sa.UniqueConstraint('session_id', 'token_hash', 'student_id', name='uq_qr_token_usages_session_token_student')
    )
    with op.batch_alter_table('qr_token_usages', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_qr_token_usages_session_id'), ['session_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_qr_token_usages_student_id'), ['student_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_qr_token_usages_token_hash'), ['token_hash'], unique=False)




def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('qr_token_usages', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_qr_token_usages_token_hash'))
        batch_op.drop_index(batch_op.f('ix_qr_token_usages_student_id'))
        batch_op.drop_index(batch_op.f('ix_qr_token_usages_session_id'))

    op.drop_table('qr_token_usages')
    with op.batch_alter_table('attendance_records', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_attendance_records_student_id'))
        batch_op.drop_index(batch_op.f('ix_attendance_records_status'))
        batch_op.drop_index(batch_op.f('ix_attendance_records_session_id'))
        batch_op.drop_index(batch_op.f('ix_attendance_records_method'))
        batch_op.drop_index(batch_op.f('ix_attendance_records_marked_at'))
        batch_op.drop_index(batch_op.f('ix_attendance_records_corrected_by_user_id'))

    op.drop_table('attendance_records')
    with op.batch_alter_table('schedules', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_schedules_classroom_id'))
        batch_op.drop_index(batch_op.f('ix_schedules_class_id'))

    op.drop_table('schedules')
    with op.batch_alter_table('enrollments', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_enrollments_student_id'))
        batch_op.drop_index(batch_op.f('ix_enrollments_class_id'))

    op.drop_table('enrollments')
    with op.batch_alter_table('attendance_sessions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_attendance_sessions_status'))
        batch_op.drop_index(batch_op.f('ix_attendance_sessions_starts_at'))
        batch_op.drop_index(batch_op.f('ix_attendance_sessions_professor_id'))
        batch_op.drop_index(batch_op.f('ix_attendance_sessions_ends_at'))
        batch_op.drop_index(batch_op.f('ix_attendance_sessions_current_qr_hash'))
        batch_op.drop_index(batch_op.f('ix_attendance_sessions_classroom_id'))
        batch_op.drop_index(batch_op.f('ix_attendance_sessions_class_id'))

    op.drop_table('attendance_sessions')
    with op.batch_alter_table('face_embeddings', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_face_embeddings_student_id'))
        batch_op.drop_index(batch_op.f('ix_face_embeddings_is_active'))

    op.drop_table('face_embeddings')
    with op.batch_alter_table('classes', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_classes_professor_id'))
        batch_op.drop_index(batch_op.f('ix_classes_department_id'))
        batch_op.drop_index(batch_op.f('ix_classes_course_id'))

    op.drop_table('classes')
    with op.batch_alter_table('biometric_consents', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_biometric_consents_student_id'))

    op.drop_table('biometric_consents')
    with op.batch_alter_table('students', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_students_user_id'))
        batch_op.drop_index(batch_op.f('ix_students_university_id'))
        batch_op.drop_index(batch_op.f('ix_students_department_id'))

    op.drop_table('students')
    with op.batch_alter_table('refresh_tokens', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_refresh_tokens_user_id'))
        batch_op.drop_index(batch_op.f('ix_refresh_tokens_token_hash'))

    op.drop_table('refresh_tokens')
    with op.batch_alter_table('professors', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_professors_user_id'))
        batch_op.drop_index(batch_op.f('ix_professors_employee_id'))
        batch_op.drop_index(batch_op.f('ix_professors_department_id'))

    op.drop_table('professors')
    with op.batch_alter_table('courses', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_courses_department_id'))
        batch_op.drop_index(batch_op.f('ix_courses_code'))

    op.drop_table('courses')
    with op.batch_alter_table('audit_logs', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_audit_logs_entity_type'))
        batch_op.drop_index(batch_op.f('ix_audit_logs_entity_id'))
        batch_op.drop_index(batch_op.f('ix_audit_logs_actor_user_id'))
        batch_op.drop_index(batch_op.f('ix_audit_logs_action'))

    op.drop_table('audit_logs')
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_users_role'))
        batch_op.drop_index(batch_op.f('ix_users_email'))

    op.drop_table('users')
    with op.batch_alter_table('departments', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_departments_name'))
        batch_op.drop_index(batch_op.f('ix_departments_code'))

    op.drop_table('departments')
    with op.batch_alter_table('classrooms', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_classrooms_name'))

    op.drop_table('classrooms')

