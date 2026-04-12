from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
import io

def generate_interview_pdf(candidate_name, job_title, evaluation_data, responses):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'TitleStyle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#2563EB'),
        spaceAfter=30
    )
    
    section_style = ParagraphStyle(
        'SectionStyle',
        parent=styles['Heading2'],
        fontSize=16,
        textColor=colors.HexColor('#059669'),
        spaceBefore=20,
        spaceAfter=10
    )

    elements = []
    
    # Header
    elements.append(Paragraph(f"Interview Performance Report", title_style))
    elements.append(Paragraph(f"<b>Candidate:</b> {candidate_name}", styles['Normal']))
    elements.append(Paragraph(f"<b>Role:</b> {job_title}", styles['Normal']))
    elements.append(Spacer(1, 20))
    
    # Scores
    elements.append(Paragraph("Overall Evaluation", section_style))
    score_data = [
        ["Category", "Score / 10"],
        ["Overall Score", f"{evaluation_data.overall_score}"],
        ["Technical Proficiency", f"{evaluation_data.technical_score}"],
        ["Communication", f"{evaluation_data.communication_score}"],
        ["Role Relevance", f"{evaluation_data.relevance_score}"]
    ]
    
    score_table = Table(score_data, colWidths=[200, 100])
    score_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F3F4F6')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
    ]))
    elements.append(score_table)
    elements.append(Spacer(1, 20))
    
    # Strengths and Weaknesses
    elements.append(Paragraph("Key Insights", section_style))
    elements.append(Paragraph("<b>Strengths:</b>", styles['Normal']))
    for s in evaluation_data.strengths:
        elements.append(Paragraph(f"• {s}", styles['Normal']))
    
    elements.append(Spacer(1, 10))
    elements.append(Paragraph("<b>Areas for Improvement:</b>", styles['Normal']))
    for w in evaluation_data.weaknesses:
        elements.append(Paragraph(f"• {w}", styles['Normal']))
    
    elements.append(Spacer(1, 20))
    
    # Summary
    elements.append(Paragraph("Executive Summary", section_style))
    elements.append(Paragraph(evaluation_data.summary, styles['Normal']))
    
    # Q&A History
    elements.append(Paragraph("Interview History", section_style))
    for i, resp in enumerate(responses):
        elements.append(Paragraph(f"<b>Question {i+1}:</b> {resp.question_text}", styles['Normal']))
        elements.append(Paragraph(f"<b>Response:</b> {resp.candidate_response}", styles['Normal']))
        if resp.feedback:
            elements.append(Paragraph(f"<b>AI Feedback:</b> {resp.feedback}", styles['Italic']))
        elements.append(Spacer(1, 10))
    
    doc.build(elements)
    buffer.seek(0)
    return buffer
