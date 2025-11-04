"""create workflow tables

Revision ID: 003
Revises: 002
Create Date: 2025-08-28

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create workflows table
    op.create_table('workflows',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('workflow_type', sa.Enum('sequential', 'parallel', 'conditional', name='workflowtype'), nullable=False),
        sa.Column('status', sa.Enum('draft', 'pending', 'in_progress', 'completed', 'cancelled', 'expired', name='workflowstatus'), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('custom_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('sent_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('deadline', sa.DateTime(), nullable=True),
        sa.Column('reminder_enabled', sa.Boolean(), nullable=True),
        sa.Column('reminder_days', sa.JSON(), nullable=True),
        sa.Column('require_sequential_order', sa.Boolean(), nullable=True),
        sa.Column('allow_decline', sa.Boolean(), nullable=True),
        sa.Column('require_authentication', sa.Boolean(), nullable=True),
        sa.Column('authentication_methods', sa.JSON(), nullable=True),
        sa.Column('ip_restrictions', sa.JSON(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_workflows_document_id', 'workflows', ['document_id'])
    op.create_index('ix_workflows_user_id', 'workflows', ['user_id'])
    op.create_index('ix_workflows_status', 'workflows', ['status'])

    # Create signers table
    op.create_table('signers',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('workflow_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('phone', sa.String(50), nullable=True),
        sa.Column('role', sa.String(100), nullable=True),
        sa.Column('status', sa.Enum('pending', 'notified', 'viewed', 'signed', 'declined', 'expired', name='signerstatus'), nullable=False),
        sa.Column('order', sa.Integer(), nullable=True),
        sa.Column('notification_channels', sa.JSON(), nullable=True),
        sa.Column('language', sa.String(10), nullable=True),
        sa.Column('access_token', sa.String(255), nullable=True),
        sa.Column('verification_code', sa.String(10), nullable=True),
        sa.Column('invited_at', sa.DateTime(), nullable=True),
        sa.Column('viewed_at', sa.DateTime(), nullable=True),
        sa.Column('signed_at', sa.DateTime(), nullable=True),
        sa.Column('declined_at', sa.DateTime(), nullable=True),
        sa.Column('reminder_sent_at', sa.JSON(), nullable=True),
        sa.Column('authentication_completed', sa.Boolean(), nullable=True),
        sa.Column('authentication_method', sa.String(50), nullable=True),
        sa.Column('authentication_at', sa.DateTime(), nullable=True),
        sa.Column('signature_data', sa.JSON(), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['workflow_id'], ['workflows.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_signers_workflow_id', 'signers', ['workflow_id'])
    op.create_index('ix_signers_email', 'signers', ['email'])
    op.create_index('ix_signers_status', 'signers', ['status'])
    op.create_index('ix_signers_access_token', 'signers', ['access_token'], unique=True)

    # Create document_fields table
    op.create_table('document_fields',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('workflow_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('signer_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('field_type', sa.Enum('signature', 'initial', 'date', 'text', 'checkbox', 'name', 'email', 'phone', name='fieldtype'), nullable=False),
        sa.Column('label', sa.String(255), nullable=True),
        sa.Column('placeholder', sa.String(255), nullable=True),
        sa.Column('page', sa.Integer(), nullable=False),
        sa.Column('x_position', sa.Float(), nullable=False),
        sa.Column('y_position', sa.Float(), nullable=False),
        sa.Column('width', sa.Float(), nullable=True),
        sa.Column('height', sa.Float(), nullable=True),
        sa.Column('required', sa.Boolean(), nullable=True),
        sa.Column('read_only', sa.Boolean(), nullable=True),
        sa.Column('default_value', sa.Text(), nullable=True),
        sa.Column('validation_rules', sa.JSON(), nullable=True),
        sa.Column('detected_by_ai', sa.Boolean(), nullable=True),
        sa.Column('ai_confidence', sa.Float(), nullable=True),
        sa.Column('detected_text', sa.Text(), nullable=True),
        sa.Column('value', sa.Text(), nullable=True),
        sa.Column('filled_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['signer_id'], ['signers.id'], ),
        sa.ForeignKeyConstraint(['workflow_id'], ['workflows.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_document_fields_workflow_id', 'document_fields', ['workflow_id'])
    op.create_index('ix_document_fields_signer_id', 'document_fields', ['signer_id'])

    # Create workflow_audit_logs table
    op.create_table('workflow_audit_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('workflow_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('event_type', sa.String(50), nullable=False),
        sa.Column('event_description', sa.Text(), nullable=True),
        sa.Column('actor_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('actor_type', sa.String(50), nullable=True),
        sa.Column('actor_name', sa.String(255), nullable=True),
        sa.Column('event_data', sa.JSON(), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['workflow_id'], ['workflows.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_workflow_audit_logs_workflow_id', 'workflow_audit_logs', ['workflow_id'])
    op.create_index('ix_workflow_audit_logs_created_at', 'workflow_audit_logs', ['created_at'])

    # Create workflow_templates table
    op.create_table('workflow_templates',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('customer_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('category', sa.String(100), nullable=True),
        sa.Column('workflow_type', sa.Enum('sequential', 'parallel', 'conditional', name='workflowtype'), nullable=True),
        sa.Column('default_deadline_days', sa.Integer(), nullable=True),
        sa.Column('signer_roles', sa.JSON(), nullable=True),
        sa.Column('field_definitions', sa.JSON(), nullable=True),
        sa.Column('default_settings', sa.JSON(), nullable=True),
        sa.Column('usage_count', sa.Integer(), nullable=True),
        sa.Column('last_used_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('ai_trained', sa.Boolean(), nullable=True),
        sa.Column('ai_accuracy', sa.Float(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_workflow_templates_user_id', 'workflow_templates', ['user_id'])
    op.create_index('ix_workflow_templates_customer_id', 'workflow_templates', ['customer_id'])

    # Create signer_contact_book table
    op.create_table('signer_contact_book',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('phone', sa.String(50), nullable=True),
        sa.Column('company', sa.String(255), nullable=True),
        sa.Column('role', sa.String(100), nullable=True),
        sa.Column('preferred_language', sa.String(10), nullable=True),
        sa.Column('preferred_channels', sa.JSON(), nullable=True),
        sa.Column('usage_count', sa.Integer(), nullable=True),
        sa.Column('last_used_at', sa.DateTime(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('tags', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_signer_contact_book_user_id', 'signer_contact_book', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_signer_contact_book_user_id', 'signer_contact_book')
    op.drop_table('signer_contact_book')
    
    op.drop_index('ix_workflow_templates_customer_id', 'workflow_templates')
    op.drop_index('ix_workflow_templates_user_id', 'workflow_templates')
    op.drop_table('workflow_templates')
    
    op.drop_index('ix_workflow_audit_logs_created_at', 'workflow_audit_logs')
    op.drop_index('ix_workflow_audit_logs_workflow_id', 'workflow_audit_logs')
    op.drop_table('workflow_audit_logs')
    
    op.drop_index('ix_document_fields_signer_id', 'document_fields')
    op.drop_index('ix_document_fields_workflow_id', 'document_fields')
    op.drop_table('document_fields')
    
    op.drop_index('ix_signers_access_token', 'signers')
    op.drop_index('ix_signers_status', 'signers')
    op.drop_index('ix_signers_email', 'signers')
    op.drop_index('ix_signers_workflow_id', 'signers')
    op.drop_table('signers')
    
    op.drop_index('ix_workflows_status', 'workflows')
    op.drop_index('ix_workflows_user_id', 'workflows')
    op.drop_index('ix_workflows_document_id', 'workflows')
    op.drop_table('workflows')
    
    # Drop enums
    op.execute('DROP TYPE IF EXISTS workflowtype')
    op.execute('DROP TYPE IF EXISTS workflowstatus')
    op.execute('DROP TYPE IF EXISTS signerstatus')
    op.execute('DROP TYPE IF EXISTS fieldtype')