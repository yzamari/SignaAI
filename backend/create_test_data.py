#!/usr/bin/env python3
"""
Create test data for dashboard - Following SOLID principles
Single Responsibility: Each class/method has one job
Open/Closed: Can extend without modifying
Liskov Substitution: Derived classes can replace base
Interface Segregation: Small, focused interfaces
Dependency Inversion: Depend on abstractions
"""

from core.database import SessionLocal, engine, Base
from models.user import User
from models.document import Document
from models.workflow import Workflow
from datetime import datetime, timedelta
import random
import hashlib
from passlib.context import CryptContext

class TestDataFactory:
    """Factory pattern for creating test data - follows OOP principles"""
    
    def __init__(self, db_session):
        self.db = db_session
        self.pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')
        
    def create_users(self, count=3):
        """Create test users - Single Responsibility"""
        users = []
        for i in range(count):
            email = f'testuser{i+1}@example.com'
            existing = self.db.query(User).filter(User.email == email).first()
            if not existing:
                user = User(
                    email=email,
                    full_name=f'Test User {i+1}',
                    password_hash=self.pwd_context.hash('test123'),
                    is_active=True,
                    organization=f'Test Company {i+1}'
                )
                self.db.add(user)
                self.db.commit()
                users.append(user)
                print(f'✅ Created user: {email}')
            else:
                users.append(existing)
                print(f'ℹ️ User exists: {email}')
        return users
    
    def create_documents(self, users, docs_per_user=5):
        """Create test documents - Single Responsibility"""
        statuses = ['pending', 'completed', 'draft', 'expired', 'cancelled']
        documents = []
        
        for user in users:
            for j in range(docs_per_user):
                # Generate a unique document hash
                doc_hash = hashlib.sha256(f'{user.id}_{j}_{datetime.now()}'.encode()).hexdigest()
                
                doc = Document(
                    user_id=user.id,
                    title=f'Contract {j+1} - {user.full_name}',
                    original_filename=f'contract_{j+1}.pdf',
                    status=random.choice(statuses),
                    file_path=f'/documents/contract_{user.id}_{j}.pdf',
                    file_size=random.randint(50000, 500000),
                    mime_type='application/pdf',
                    document_hash=doc_hash,
                    page_count=random.randint(1, 10),
                    created_at=datetime.now() - timedelta(days=random.randint(0, 30))
                )
                self.db.add(doc)
                documents.append(doc)
            self.db.commit()
            print(f'✅ Created {docs_per_user} documents for {user.email}')
        return documents
    
    def create_signatures(self, documents, sigs_per_doc=2):
        """Create signature fields - Single Responsibility"""
        # Signature fields would be created here if the model existed
        print(f'ℹ️ Skipping signature fields (model not available)')
        return []
    
    def create_workflows(self, documents, count=5):
        """Create workflows - Single Responsibility"""
        workflows = []
        for i in range(min(count, len(documents))):
            workflow = Workflow(
                document_id=documents[i].id,
                workflow_type=random.choice(['sequential', 'parallel']),
                status=random.choice(['pending', 'completed', 'in_progress']),
                created_at=datetime.now() - timedelta(days=random.randint(0, 20))
            )
            self.db.add(workflow)
            workflows.append(workflow)
        self.db.commit()
        print(f'✅ Created {len(workflows)} workflows')
        return workflows
    
    def create_audit_logs(self, users, documents, count=20):
        """Create audit logs - Single Responsibility"""
        # Audit logs would be created here if the model existed
        print(f'ℹ️ Skipping audit logs (model not available)')
        return []
    
    def print_summary(self):
        """Print database summary - Single Responsibility"""
        print('\n' + '='*50)
        print('📊 Database Summary')
        print('='*50)
        print(f'👥 Users: {self.db.query(User).count()}')
        print(f'📄 Documents: {self.db.query(Document).count()}')
        print(f'   ⏳ Pending: {self.db.query(Document).filter(Document.status == "pending").count()}')
        print(f'   ✅ Completed: {self.db.query(Document).filter(Document.status == "completed").count()}')
        print(f'   📝 Draft: {self.db.query(Document).filter(Document.status == "draft").count()}')
        print(f'🔄 Workflows: {self.db.query(Workflow).count()}')
        print('='*50)


def main():
    """Main entry point - Dependency Injection pattern"""
    # Create tables
    Base.metadata.create_all(bind=engine)
    
    # Create session
    db = SessionLocal()
    
    try:
        # Use factory to create test data
        factory = TestDataFactory(db)
        
        # Create data following OOP principles
        users = factory.create_users(count=5)
        documents = factory.create_documents(users, docs_per_user=4)
        signatures = factory.create_signatures(documents)
        workflows = factory.create_workflows(documents, count=8)
        audit_logs = factory.create_audit_logs(users, documents, count=30)
        
        # Print summary
        factory.print_summary()
        
        print('\n✅ Test data created successfully!')
        print('🎯 Dashboard should now show REAL data from database')
        
    finally:
        db.close()


if __name__ == '__main__':
    main()