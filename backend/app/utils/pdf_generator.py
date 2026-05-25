from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch
import io
import json
import logging

logger = logging.getLogger(__name__)

def generate_interview_pdf(candidate_name, job_title, evaluation_data, responses):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, 
        pagesize=letter,
        topMargin=0.75*inch,
        bottomMargin=0.75*inch,
        leftMargin=0.75*inch,
        rightMargin=0.75*inch
    )
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

    question_style = ParagraphStyle(
        'QuestionStyle',
        parent=styles['Normal'],
        fontSize=11,
        textColor=colors.HexColor('#1E40AF'),
        spaceAfter=4,
        fontName='Helvetica-Bold'
    )

    response_style = ParagraphStyle(
        'ResponseStyle',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#374151'),
        spaceAfter=4,
        leftIndent=15
    )

    feedback_style = ParagraphStyle(
        'FeedbackStyle',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.HexColor('#6B7280'),
        fontName='Helvetica-Oblique',
        spaceAfter=4,
        leftIndent=15
    )

    score_label_style = ParagraphStyle(
        'ScoreLabelStyle',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.HexColor('#059669'),
        fontName='Helvetica-Bold',
        leftIndent=15,
        spaceAfter=8
    )

    elements = []
    
    # Header
    elements.append(Paragraph("Interview Performance Report", title_style))
    elements.append(Paragraph(f"<b>Candidate:</b> {candidate_name}", styles['Normal']))
    elements.append(Paragraph(f"<b>Role:</b> {job_title}", styles['Normal']))
    elements.append(Spacer(1, 20))
    
    # Scores Table
    elements.append(Paragraph("Overall Evaluation", section_style))

    overall = getattr(evaluation_data, 'overall_score', 0) or 0
    technical = getattr(evaluation_data, 'technical_score', 0) or 0
    communication = getattr(evaluation_data, 'communication_score', 0) or 0
    relevance = getattr(evaluation_data, 'relevance_score', 0) or 0

    score_data = [
        ["Category", "Score / 10"],
        ["Overall Score", f"{overall:.1f}"],
        ["Technical Proficiency", f"{technical:.1f}"],
        ["Communication", f"{communication:.1f}"],
        ["Role Relevance", f"{relevance:.1f}"]
    ]
    
    score_table = Table(score_data, colWidths=[250, 120])
    score_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E40AF')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E5E7EB')),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F9FAFB')]),
    ]))
    elements.append(score_table)
    elements.append(Spacer(1, 20))
    
    # Strengths and Weaknesses
    elements.append(Paragraph("Key Insights", section_style))

    strengths = getattr(evaluation_data, 'strengths', []) or []
    weaknesses = getattr(evaluation_data, 'weaknesses', []) or []

    elements.append(Paragraph("<b>Strengths:</b>", styles['Normal']))
    for s in strengths:
        elements.append(Paragraph(f"&bull; {_safe_text(s)}", styles['Normal']))
    
    elements.append(Spacer(1, 10))
    elements.append(Paragraph("<b>Areas for Improvement:</b>", styles['Normal']))
    for w in weaknesses:
        elements.append(Paragraph(f"&bull; {_safe_text(w)}", styles['Normal']))
    
    elements.append(Spacer(1, 20))
    
    # Summary
    elements.append(Paragraph("Executive Summary", section_style))
    summary = getattr(evaluation_data, 'summary', 'Interview completed.') or 'Interview completed.'
    elements.append(Paragraph(_safe_text(summary), styles['Normal']))
    
    elements.append(Spacer(1, 20))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#E5E7EB')))
    elements.append(Spacer(1, 10))

    # ==============================
    # Q&A History — Detailed per-question breakdown
    # ==============================
    elements.append(Paragraph("Interview Q&amp;A Details", section_style))
    elements.append(Spacer(1, 5))
    
    # Filter out empty placeholder responses
    valid_responses = [r for r in responses if r.candidate_response and r.candidate_response.strip()]
    
    if not valid_responses:
        elements.append(Paragraph("<i>No candidate responses recorded for this interview.</i>", styles['Normal']))
    else:
        for i, resp in enumerate(valid_responses):
            # Question number + text
            q_text = _safe_text(resp.question_text or f"Question {i+1}")
            elements.append(Paragraph(f"Q{i+1}: {q_text}", question_style))
            
            # Candidate response
            r_text = _safe_text(resp.candidate_response or "(No response)")
            elements.append(Paragraph(f"<b>Answer:</b> {r_text}", response_style))
            
            # Parse evaluation data from feedback field
            score, feedback_text = _parse_feedback(resp.feedback, resp.evaluation_score)
            
            # Score badge
            if score is not None and score > 0:
                score_color = _score_color(score)
                elements.append(Paragraph(
                    f"Score: {score}/10",
                    score_label_style
                ))
            
            # AI Feedback
            if feedback_text:
                elements.append(Paragraph(
                    f"<b>AI Feedback:</b> {_safe_text(feedback_text)}",
                    feedback_style
                ))
            
            # Separator between questions
            elements.append(Spacer(1, 5))
            elements.append(HRFlowable(width="90%", thickness=0.5, color=colors.HexColor('#E5E7EB')))
            elements.append(Spacer(1, 8))

    # Footer
    elements.append(Spacer(1, 30))
    elements.append(Paragraph(
        f"<i>Report generated for {_safe_text(candidate_name)} — AI Interviewer Platform</i>",
        ParagraphStyle('Footer', parent=styles['Normal'], fontSize=8, textColor=colors.HexColor('#9CA3AF'), alignment=1)
    ))
    
    doc.build(elements)
    buffer.seek(0)
    return buffer


def _parse_feedback(feedback_raw, evaluation_score):
    """Parse the feedback field which may be a JSON string, a dict, or a plain string."""
    score = evaluation_score
    feedback_text = ""
    
    if not feedback_raw:
        return score, feedback_text
    
    # Try to parse as JSON
    try:
        if isinstance(feedback_raw, str):
            data = json.loads(feedback_raw)
        elif isinstance(feedback_raw, dict):
            data = feedback_raw
        else:
            return score, str(feedback_raw)
        
        # Extract score from various possible keys
        if 'technical_accuracy' in data:
            score = data['technical_accuracy']
        elif 'score' in data:
            score = data['score']
        
        # Extract feedback text from various possible keys
        if 'feedback' in data:
            feedback_text = data['feedback']
        elif 'evaluation' in data:
            feedback_text = data['evaluation']
        elif 'summary' in data:
            feedback_text = data['summary']
        else:
            # Use all non-score fields as feedback
            parts = []
            for k, v in data.items():
                if k not in ('technical_accuracy', 'score') and isinstance(v, str):
                    parts.append(f"{k}: {v}")
            feedback_text = "; ".join(parts) if parts else str(data)
            
    except (json.JSONDecodeError, TypeError, ValueError):
        # Not JSON — use as plain text
        feedback_text = str(feedback_raw)
    
    return score, feedback_text


def _score_color(score):
    """Return a color based on score value."""
    if score >= 8:
        return colors.HexColor('#059669')  # Green
    elif score >= 6:
        return colors.HexColor('#D97706')  # Amber
    elif score >= 4:
        return colors.HexColor('#EA580C')  # Orange
    else:
        return colors.HexColor('#DC2626')  # Red


def _safe_text(text):
    """Escape XML-unsafe characters for ReportLab Paragraph."""
    if not text:
        return ""
    text = str(text)
    # Replace XML-unsafe characters
    text = text.replace('&', '&amp;')
    text = text.replace('<', '&lt;')
    text = text.replace('>', '&gt;')
    # But preserve our own HTML tags
    text = text.replace('&lt;b&gt;', '<b>').replace('&lt;/b&gt;', '</b>')
    text = text.replace('&lt;i&gt;', '<i>').replace('&lt;/i&gt;', '</i>')
    return text
